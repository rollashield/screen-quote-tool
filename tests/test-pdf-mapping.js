/**
 * Tests for pdf-signing.js mapOrderDataToTemplate()
 * Run: node tests/test-pdf-mapping.js
 *
 * Tests the pure data transformation from orderData to PDF template format.
 * This is the bridge between calculation and PDF rendering — verifying
 * excluded screens are filtered, addresses formatted, comparisons labeled.
 */

const assert = require('assert');

// Load pricing dependencies
const pricingData = require('../pricing-data');
Object.assign(global, pricingData);

const pricingEngine = require('../pricing-engine');
Object.assign(global, pricingEngine);

// Load the module under test
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
    return {
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
        customerPrice: 1800,
        installationPrice: 525,
        wiringPrice: 0,
        totalCost: 700,
        phase: 'configured',
        excluded: false,
        comparisonMaterialPrice: null,
        ...overrides
    };
}

function makeOrderData(overrides = {}) {
    return {
        id: 'test-123',
        customerName: 'John Doe',
        companyName: '',
        customerEmail: 'john@example.com',
        customerPhone: '(480) 555-1234',
        streetAddress: '123 Main St',
        aptSuite: '',
        city: 'Tempe',
        state: 'AZ',
        zipCode: '85281',
        nearestIntersection: '',
        salesRepName: 'Tommy Whitby',
        salesRepEmail: 'tommy@rollashield.com',
        salesRepPhone: '(480) 555-0000',
        quoteNumber: 'RAS-001234',
        screens: [makeScreen()],
        orderTotalMaterialsPrice: 1275,
        orderTotalInstallationPrice: 525,
        orderTotalWiringPrice: 0,
        orderTotalPrice: 1800,
        discountPercent: 0,
        discountAmount: 0,
        discountedMaterialsPrice: 1275,
        miscInstallAmount: 0,
        miscInstallLabel: '',
        fourWeekGuarantee: false,
        totalGuaranteeDiscount: 0,
        enableComparison: false,
        comparisonType: 'motor',
        comparisonMotor: '',
        comparisonTrack: '',
        comparisonTotalMaterialsPrice: 0,
        comparisonDiscountedMaterialsPrice: 0,
        comparisonTotalPrice: 0,
        projectAccessories: [],
        ...overrides
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Screen Filtering \u2500\u2500');

test('Excluded screens filtered from PDF output', () => {
    const data = makeOrderData({
        screens: [
            makeScreen({ screenName: 'Keep', excluded: false }),
            makeScreen({ screenName: 'Drop', excluded: true }),
            makeScreen({ screenName: 'Also Keep', excluded: false })
        ]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens.length, 2, 'Should have 2 screens');
    assert.strictEqual(result.screens[0].name, 'Keep');
    assert.strictEqual(result.screens[1].name, 'Also Keep');
});

test('All screens excluded results in empty screens array', () => {
    const data = makeOrderData({
        screens: [
            makeScreen({ excluded: true }),
            makeScreen({ excluded: true })
        ]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens.length, 0);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Unconfigured Screen Guard \u2500\u2500');

test('Unconfigured non-excluded screen throws error', () => {
    const data = makeOrderData({
        screens: [
            { phase: 'opening', excluded: false, screenName: 'Opening 1' },
            makeScreen()
        ]
    });
    assert.throws(() => mapOrderDataToTemplate(data), /Cannot generate PDF/);
});

test('Unconfigured excluded screen does NOT throw', () => {
    const data = makeOrderData({
        screens: [
            { phase: 'opening', excluded: true, screenName: 'Excluded Opening' },
            makeScreen()
        ]
    });
    assert.doesNotThrow(() => mapOrderDataToTemplate(data));
});

test('Multiple unconfigured screens: error message includes count', () => {
    const data = makeOrderData({
        screens: [
            { phase: 'opening', excluded: false, screenName: 'A' },
            { phase: 'opening', excluded: false, screenName: 'B' },
            makeScreen()
        ]
    });
    try {
        mapOrderDataToTemplate(data);
        assert.fail('Should have thrown');
    } catch (e) {
        assert.ok(e.message.includes('2 opening(s)'), `Should mention 2 openings: ${e.message}`);
    }
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Address Formatting \u2500\u2500');

test('Full address formatted correctly', () => {
    const data = makeOrderData({
        streetAddress: '123 Main St',
        aptSuite: 'Suite 100',
        city: 'Tempe',
        state: 'AZ',
        zipCode: '85281'
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.address, '123 Main St, Suite 100, Tempe, AZ, 85281');
});

test('Address without apt/suite', () => {
    const data = makeOrderData({
        streetAddress: '456 Oak Ave',
        aptSuite: '',
        city: 'Phoenix',
        state: 'AZ',
        zipCode: '85001'
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.address, '456 Oak Ave, Phoenix, AZ, 85001');
});

test('Address with only street', () => {
    const data = makeOrderData({
        streetAddress: '789 Elm Blvd',
        aptSuite: '',
        city: '',
        state: '',
        zipCode: ''
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.address, '789 Elm Blvd');
});

test('Empty address produces empty string', () => {
    const data = makeOrderData({
        streetAddress: '',
        aptSuite: '',
        city: '',
        state: '',
        zipCode: ''
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.address, '');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Customer & Sales Rep \u2500\u2500');

test('Customer fields mapped correctly', () => {
    const data = makeOrderData();
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.name, 'John Doe');
    assert.strictEqual(result.customer.email, 'john@example.com');
    assert.strictEqual(result.customer.phone, '(480) 555-1234');
});

test('Sales rep fields mapped correctly', () => {
    const data = makeOrderData();
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.salesRep.name, 'Tommy Whitby');
    assert.strictEqual(result.salesRep.email, 'tommy@rollashield.com');
});

test('Missing customer fields default to empty strings', () => {
    const data = makeOrderData({
        customerName: '',
        customerEmail: '',
        customerPhone: ''
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.customer.name, '');
    assert.strictEqual(result.customer.email, '');
    assert.strictEqual(result.customer.phone, '');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Quote Metadata \u2500\u2500');

test('Quote number mapped to output', () => {
    const data = makeOrderData({ quoteNumber: 'RAS-005678' });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.quote.number, 'RAS-005678');
});

test('Missing quote number defaults to DRAFT', () => {
    const data = makeOrderData({ quoteNumber: '' });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.quote.number, 'DRAFT');
});

test('Signing URL generated from quote ID', () => {
    const data = makeOrderData({ id: 'quote-abc' });
    const result = mapOrderDataToTemplate(data);
    assert.ok(result.signingUrl.includes('quoteId=quote-abc'));
    assert.ok(result.signingUrl.includes('mode=in-person'));
});

test('No signing URL when no quote ID', () => {
    const data = makeOrderData({ id: null });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.signingUrl, null);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Pricing \u2500\u2500');

test('Deposit is 50% of total', () => {
    const data = makeOrderData({ orderTotalPrice: 5000 });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.pricing.deposit, 2500);
    assert.strictEqual(result.pricing.balance, 2500);
});

test('Discount reflected in pricing', () => {
    const data = makeOrderData({
        discountPercent: 10,
        discountAmount: 127.5,
        discountedMaterialsPrice: 1147.5,
        orderTotalPrice: 1672.5
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.pricing.discountPercent, 10);
    assert.ok(approxEqual(result.pricing.discountAmount, 127.5));
});

test('Guarantee discount shown', () => {
    const data = makeOrderData({
        fourWeekGuarantee: true,
        totalGuaranteeDiscount: 360
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.pricing.fourWeekGuarantee, true);
    assert.strictEqual(result.pricing.guaranteeDiscount, 360);
});

test('Screen material price = customerPrice - installationPrice - wiringPrice', () => {
    const screen = makeScreen({ customerPrice: 2000, installationPrice: 525, wiringPrice: 220 });
    const data = makeOrderData({ screens: [screen] });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].price1, 1255);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Screen Data Mapping \u2500\u2500');

test('Screen fields mapped to PDF format', () => {
    const data = makeOrderData();
    const result = mapOrderDataToTemplate(data);
    const screen = result.screens[0];
    assert.strictEqual(screen.name, 'Test Screen');
    // Client-facing names
    assert.strictEqual(screen.track, 'Zipper Track');
    assert.strictEqual(screen.operator, 'Remote-Operated Motor');
    assert.strictEqual(screen.fabric, 'Espresso Texture');
    assert.strictEqual(screen.frame, 'White');
});

test('Screen install price mapped to PDF format', () => {
    const data = makeOrderData({
        screens: [makeScreen({ installationPrice: 445, includeInstallation: true })]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].installPrice, 445);
    assert.strictEqual(result.screens[0].includeInstallation, true);
});

test('Screen wiring price mapped to PDF format', () => {
    const data = makeOrderData({
        screens: [makeScreen({ wiringPrice: 215, includeInstallation: true })]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].wiringPrice, 215);
});

test('Screen with no installation shows includeInstallation=false', () => {
    const data = makeOrderData({
        screens: [makeScreen({ includeInstallation: false, installationPrice: 0, wiringPrice: 0 })]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].includeInstallation, false);
    assert.strictEqual(result.screens[0].installPrice, 0);
    assert.strictEqual(result.screens[0].wiringPrice, 0);
});

test('Screen without wiring defaults wiringPrice to 0', () => {
    const data = makeOrderData({
        screens: [makeScreen({ wiringPrice: undefined })]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].wiringPrice, 0);
});

test('Screen without name gets default "Screen N"', () => {
    const data = makeOrderData({
        screens: [makeScreen({ screenName: null })]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens[0].name, 'Screen 1');
});

test('Multiple screens numbered correctly after excluding', () => {
    const data = makeOrderData({
        screens: [
            makeScreen({ screenName: null, excluded: false }),
            makeScreen({ screenName: null, excluded: true }),
            makeScreen({ screenName: null, excluded: false })
        ]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.screens.length, 2);
    // Note: numbering restarts at 1 for included screens
    assert.strictEqual(result.screens[0].name, 'Screen 1');
    assert.strictEqual(result.screens[1].name, 'Screen 2');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Project Accessories \u2500\u2500');

test('Project accessories with quantity > 0 included', () => {
    const data = makeOrderData({
        projectAccessories: [
            { id: 'bond-bridge', name: 'Bond Bridge', cost: 200, customerPrice: 360, quantity: 1 },
            { id: 'wind-sensor', name: 'Wind Sensor', cost: 50, customerPrice: 90, quantity: 0 }
        ]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.projectAccessories.length, 1, 'Zero-qty filtered out');
    assert.strictEqual(result.projectAccessories[0].name, 'Bond Bridge');
    assert.strictEqual(result.projectAccessories[0].quantity, 1);
    assert.strictEqual(result.projectAccessories[0].lineTotal, 360);
});

test('No project accessories results in empty array', () => {
    const data = makeOrderData({ projectAccessories: [] });
    const result = mapOrderDataToTemplate(data);
    assert.deepStrictEqual(result.projectAccessories, []);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Comparison Pricing \u2500\u2500');

test('No comparison when disabled', () => {
    const data = makeOrderData({ enableComparison: false });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.comparisonPricing, null);
});

test('Motor comparison generates labels', () => {
    const data = makeOrderData({
        enableComparison: true,
        comparisonType: 'motor',
        comparisonMotor: 'gear',
        comparisonTotalMaterialsPrice: 800,
        comparisonDiscountedMaterialsPrice: 800,
        comparisonTotalPrice: 1325,
        screens: [makeScreen()]
    });
    const result = mapOrderDataToTemplate(data);
    assert.ok(result.comparisonPricing, 'Should have comparison pricing');
    assert.strictEqual(result.comparisonPricing.option1Label, 'Remote-Operated Motor');
    assert.strictEqual(result.comparisonPricing.option2Label, 'Manual Gear Operation');
});

test('Track comparison generates labels', () => {
    const data = makeOrderData({
        enableComparison: true,
        comparisonType: 'track',
        comparisonTrack: 'sunair-cable',
        comparisonTotalMaterialsPrice: 900,
        comparisonDiscountedMaterialsPrice: 900,
        comparisonTotalPrice: 1425,
        screens: [makeScreen()]
    });
    const result = mapOrderDataToTemplate(data);
    assert.ok(result.comparisonPricing);
    assert.strictEqual(result.comparisonPricing.option1Label, 'Zipper Track');
    assert.ok(result.comparisonPricing.option2Label.includes('Cable'),
        `Should mention Cable: ${result.comparisonPricing.option2Label}`);
});

test('Comparison deposit is 50% of comparison total', () => {
    const data = makeOrderData({
        enableComparison: true,
        comparisonType: 'motor',
        comparisonMotor: 'gear',
        comparisonTotalPrice: 2000,
        comparisonTotalMaterialsPrice: 1000,
        comparisonDiscountedMaterialsPrice: 1000,
        screens: [makeScreen()]
    });
    const result = mapOrderDataToTemplate(data);
    assert.strictEqual(result.comparisonPricing.deposit2, 1000);
    assert.strictEqual(result.comparisonPricing.balance2, 1000);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Guarantee Quote Validity \u2500\u2500');

test('Guarantee active: quote valid for 1 day', () => {
    const data = makeOrderData({ fourWeekGuarantee: true });
    const result = mapOrderDataToTemplate(data);
    const quoteDate = new Date(result.quote.date);
    const validThrough = new Date(result.quote.validThrough);
    const diffDays = Math.round((validThrough - quoteDate) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 1, 'Guarantee quotes valid 1 day');
});

test('No guarantee: quote valid for 30 days', () => {
    const data = makeOrderData({ fourWeekGuarantee: false });
    const result = mapOrderDataToTemplate(data);
    const quoteDate = new Date(result.quote.date);
    const validThrough = new Date(result.quote.validThrough);
    const diffDays = Math.round((validThrough - quoteDate) / (1000 * 60 * 60 * 24));
    assert.strictEqual(diffDays, 30, 'Normal quotes valid 30 days');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
