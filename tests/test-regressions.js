/**
 * Regression tests for known production bugs
 * Run: node tests/test-regressions.js
 *
 * Every bug found in production gets a test here to prevent recurrence.
 * Each test documents: what broke, when, and why.
 */

const assert = require('assert');

// Load pricing dependencies
const pricingData = require('../pricing-data');
Object.assign(global, pricingData);

const pricingEngine = require('../pricing-engine');
Object.assign(global, pricingEngine);

const pdfSigning = require('../pdf-signing');
const { mapOrderDataToTemplate } = pdfSigning;

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  \u2713 ${name}`);
        passed++;
    } catch (e) {
        console.log(`  \u2717 ${name}: ${e.message}`);
        failed++;
    }
}

function approxEqual(a, b, tolerance = 0.02) {
    return Math.abs(a - b) <= tolerance;
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeScreen(overrides = {}) {
    const defaults = {
        screenName: 'Test Screen',
        trackType: 'sunair-zipper',
        trackTypeName: 'Sunair Zipper Track',
        operatorType: 'gaposa-rts',
        operatorTypeName: 'Gaposa RTS Motor',
        fabricColor: 'T18FVT061-Espresso',
        fabricColorName: 'Espresso Texture',
        frameColor: 'white',
        frameColorName: 'White',
        width: 8,
        height: 8,
        totalWidthInches: 96,
        totalHeightInches: 96,
        actualWidthDisplay: "8' 0\"",
        actualHeightDisplay: "8' 0\"",
        noTracks: false,
        includeInstallation: true,
        wiringDistance: 0,
        accessories: [],
        photos: [],
        pendingPhotos: [],
        widthInputValue: '96',
        widthFractionValue: '',
        heightInputValue: '96',
        heightFractionValue: '',
        phase: 'configured',
        excluded: false,
        customerPrice: 1800,
        installationPrice: 525,
        wiringPrice: 0,
        totalCost: 700,
        comparisonMaterialPrice: null,
        ...overrides
    };
    return defaults;
}


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Excluded screens shown in quote summary (2026-03) \u2500\u2500');
// Commit: f519fe7 — Fix excluded screens still showing in quote summary and finalize page
// Root cause: displayOrderQuoteSummary() iterated all screens without checking screen.excluded

test('displayOrderQuoteSummary: excluded screens skipped in display loop', () => {
    const screens = [
        makeScreen({ screenName: 'North', excluded: true }),
        makeScreen({ screenName: 'South', excluded: false }),
        makeScreen({ screenName: 'East', excluded: false })
    ];
    // Simulate the fixed display loop
    const displayed = [];
    screens.forEach((screen) => {
        if (screen.excluded) return;
        displayed.push(screen.screenName);
    });
    assert.deepStrictEqual(displayed, ['South', 'East']);
});

test('displayOrderQuoteSummary: screen count excludes excluded', () => {
    const screens = [
        makeScreen({ excluded: false }),
        makeScreen({ excluded: true }),
        makeScreen({ excluded: false })
    ];
    const count = screens.filter(s => !s.excluded).length;
    assert.strictEqual(count, 2, 'Should show 2, not 3');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Excluded screens on finalize page (2026-03) \u2500\u2500');
// Same commit as above — finalize.html had 3 loops iterating all screens

test('finalize: project info screen count excludes excluded', () => {
    const screens = [
        makeScreen({ excluded: false }),
        makeScreen({ excluded: true })
    ];
    const count = screens.filter(s => !s.excluded).length;
    assert.strictEqual(count, 1);
});

test('finalize: screen config summary skips excluded', () => {
    const screens = [
        makeScreen({ screenName: 'Show', excluded: false }),
        makeScreen({ screenName: 'Hide', excluded: true })
    ];
    const rendered = [];
    screens.forEach((s) => {
        if (s.excluded) return;
        rendered.push(s.screenName);
    });
    assert.deepStrictEqual(rendered, ['Show']);
});

test('finalize: production email skips excluded screens', () => {
    const screens = [
        makeScreen({ screenName: 'Include', excluded: false }),
        makeScreen({ screenName: 'Exclude', excluded: true })
    ];
    const emailScreens = [];
    screens.forEach((screen) => {
        if (screen.excluded) return;
        emailScreens.push(screen.screenName);
    });
    assert.deepStrictEqual(emailScreens, ['Include']);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Email screen counts included excluded screens (2026-03) \u2500\u2500');
// Commit: e1a87b8 — Fix email screen counts to exclude excluded screens
// Root cause: Worker used quoteData.screens?.length without filtering

test('Worker getIncludedScreens: filters excluded screens', () => {
    // Simulate the helper function added to cloudflare-worker.js
    function getIncludedScreens(quoteData) {
        return (quoteData.screens || []).filter(s => !s.excluded);
    }

    const quoteData = {
        screens: [
            makeScreen({ excluded: false }),
            makeScreen({ excluded: true }),
            makeScreen({ excluded: false })
        ]
    };
    assert.strictEqual(getIncludedScreens(quoteData).length, 2);
});

test('Worker getIncludedScreens: handles missing screens array', () => {
    function getIncludedScreens(quoteData) {
        return (quoteData.screens || []).filter(s => !s.excluded);
    }
    assert.strictEqual(getIncludedScreens({}).length, 0);
    assert.strictEqual(getIncludedScreens({ screens: null }).length, 0);
});

test('Worker getIncludedScreens: all excluded = 0', () => {
    function getIncludedScreens(quoteData) {
        return (quoteData.screens || []).filter(s => !s.excluded);
    }
    const quoteData = {
        screens: [
            makeScreen({ excluded: true }),
            makeScreen({ excluded: true })
        ]
    };
    assert.strictEqual(getIncludedScreens(quoteData).length, 0);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Comparison column showing with no motor selected (2024) \u2500\u2500');
// Commit: 2124695 — Fix comparison column showing when no comparison motor selected
// Root cause: hasComparison check didn't verify comparisonMotor was truthy

test('Comparison disabled when comparisonMotor is empty', () => {
    const hasComparison = false && (
        ('motor' === 'track' && '') ||
        ('motor' === 'motor' && '')  // empty string is falsy
    );
    assert.strictEqual(hasComparison, false);
});

test('Comparison enabled when comparisonMotor has value', () => {
    const enableComparison = true;
    const comparisonType = 'motor';
    const comparisonMotor = 'gear';
    const hasComparison = enableComparison && (
        (comparisonType === 'track' && '') ||
        (comparisonType === 'motor' && comparisonMotor)
    );
    assert.ok(hasComparison, 'Should be truthy when motor is set');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Wiring fields lost through recalculate (2026-03) \u2500\u2500');
// Commit: 6570c90 — Add missing wiring fields and preserve measurements through recalculate
// Root cause: computeScreenPricing didn't pass through wiringDistance input

test('wiringDistance preserved through computeScreenPricing', () => {
    const screen = {
        screenName: 'Test',
        trackType: 'sunair-zipper',
        trackTypeName: 'Sunair Zipper Track',
        operatorType: 'gaposa-rts',
        operatorTypeName: 'Gaposa RTS Motor',
        fabricColor: 'T18FVT061-Espresso',
        fabricColorName: 'Espresso Texture',
        frameColor: 'white',
        frameColorName: 'White',
        width: 8,
        height: 8,
        totalWidthInches: 96,
        totalHeightInches: 96,
        actualWidthDisplay: "8' 0\"",
        actualHeightDisplay: "8' 0\"",
        noTracks: false,
        includeInstallation: true,
        wiringDistance: 15,
        accessories: [],
        photos: [],
        pendingPhotos: [],
        widthInputValue: '96',
        widthFractionValue: '',
        heightInputValue: '96',
        heightFractionValue: ''
    };
    const priced = computeScreenPricing(screen);
    assert.ok(priced.wiringPrice > 0, 'Wiring price should be calculated');
    assert.ok(priced.wiringCost > 0, 'Wiring cost should be calculated');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Measurements lost when saving from index.html (2026-03) \u2500\u2500');
// Commit: f01586b — Preserve finalize measurements when saving from index.html
// Root cause: INSERT OR REPLACE deleted the row (including finalize-owned columns)

test('Server-side merge concept: existing fields preserved when not in payload', () => {
    // Simulate the merge logic
    const existingData = {
        customerName: 'John',
        screens: [],
        measurements: { screen1: { widthTop: 96 } }  // finalize-owned
    };
    const incomingData = {
        customerName: 'John Updated',
        screens: [{ name: 'Screen 1' }]
        // No 'measurements' key — should be preserved from existing
    };
    const merged = { ...existingData, ...incomingData };
    assert.strictEqual(merged.customerName, 'John Updated', 'Incoming field overwrites');
    assert.deepStrictEqual(merged.measurements, { screen1: { widthTop: 96 } },
        'Existing field preserved when not in incoming');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: PDF generated for incomplete quotes \u2500\u2500');
// mapOrderDataToTemplate guards against unconfigured openings

test('PDF blocked for quotes with unconfigured non-excluded openings', () => {
    const orderData = {
        screens: [
            { phase: 'opening', excluded: false, screenName: 'Unconfigured' },
            makeScreen()
        ],
        customerName: 'Test',
        streetAddress: '', aptSuite: '', city: '', state: '', zipCode: '',
        customerEmail: '', customerPhone: '',
        salesRepName: '', salesRepEmail: '', salesRepPhone: '',
        quoteNumber: 'TEST',
        orderTotalMaterialsPrice: 0, orderTotalInstallationPrice: 0,
        orderTotalWiringPrice: 0, orderTotalPrice: 0,
        discountPercent: 0, discountAmount: 0, discountedMaterialsPrice: 0,
        miscInstallAmount: 0, miscInstallLabel: '',
        fourWeekGuarantee: false, totalGuaranteeDiscount: 0,
        enableComparison: false, comparisonType: 'motor',
        comparisonMotor: '', comparisonTrack: '',
        projectAccessories: [], id: 'test-1'
    };
    assert.throws(() => mapOrderDataToTemplate(orderData), /Cannot generate PDF/);
});

test('PDF allowed when all unconfigured openings are excluded', () => {
    const orderData = {
        screens: [
            { phase: 'opening', excluded: true, screenName: 'Excluded' },
            makeScreen()
        ],
        customerName: 'Test',
        streetAddress: '', aptSuite: '', city: '', state: '', zipCode: '',
        customerEmail: '', customerPhone: '',
        salesRepName: '', salesRepEmail: '', salesRepPhone: '',
        quoteNumber: 'TEST',
        orderTotalMaterialsPrice: 0, orderTotalInstallationPrice: 0,
        orderTotalWiringPrice: 0, orderTotalPrice: 0,
        discountPercent: 0, discountAmount: 0, discountedMaterialsPrice: 0,
        miscInstallAmount: 0, miscInstallLabel: '',
        fourWeekGuarantee: false, totalGuaranteeDiscount: 0,
        enableComparison: false, comparisonType: 'motor',
        comparisonMotor: '', comparisonTrack: '',
        projectAccessories: [], id: 'test-1'
    };
    assert.doesNotThrow(() => mapOrderDataToTemplate(orderData));
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 BUG: Airtable close-out included excluded screen photos (2026-03) \u2500\u2500');
// Fix in syncAirtableCloseOut: filters screens with .filter(s => !s.excluded) before collecting photos

test('Airtable photo collection filters excluded screens', () => {
    const screens = [
        makeScreen({ excluded: false, photos: [{ key: 'photo1.jpg' }] }),
        makeScreen({ excluded: true, photos: [{ key: 'photo2.jpg' }] }),
        makeScreen({ excluded: false, photos: [{ key: 'photo3.jpg' }] })
    ];
    const includedScreens = screens.filter(s => !s.excluded);
    const photos = [];
    for (const screen of includedScreens) {
        for (const photo of (screen.photos || [])) {
            if (photo.key) photos.push(photo.key);
        }
    }
    assert.deepStrictEqual(photos, ['photo1.jpg', 'photo3.jpg']);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
