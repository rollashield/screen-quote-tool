/**
 * Tests for screen state logic
 * Run: node tests/test-screen-states.js
 *
 * Tests phase transitions, exclude toggle, entity ID preservation,
 * duplicate behavior, backward compatibility, and project accessories filtering.
 */

const assert = require('assert');

// Load pricing dependencies
const pricingData = require('../pricing-data');
Object.assign(global, pricingData);

const pricingEngine = require('../pricing-engine');
Object.assign(global, pricingEngine);

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

// ─── Helpers ────────────────────────────────────────────────────────────────
function makeOpening(overrides = {}) {
    return {
        phase: 'opening',
        excluded: false,
        screenName: 'Test Opening',
        widthInputValue: '96',
        widthFractionValue: '',
        heightInputValue: '96',
        heightFractionValue: '',
        totalWidthInches: 96,
        totalHeightInches: 96,
        width: 8,
        height: 8,
        actualWidthDisplay: "8' 0\"",
        actualHeightDisplay: "8' 0\"",
        includeInstallation: true,
        wiringDistance: 0,
        openingNotes: '',
        photos: [],
        pendingPhotos: [],
        preferredTrackType: '',
        preferredOperator: '',
        preferredFabric: '',
        preferredFrameColor: '',
        _openingId: null,
        _lineItemId: null,
        ...overrides
    };
}

function makeConfigured(overrides = {}) {
    const base = {
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
        _openingId: null,
        _lineItemId: null,
        excluded: false,
        ...overrides
    };
    const priced = computeScreenPricing(base);
    return { ...base, ...priced, ...overrides };
}

// Simulate configuring an opening (mirrors applyConfiguration logic)
function configureOpening(opening, config) {
    const merged = {
        ...opening,
        ...config,
        phase: 'configured'
    };
    const priced = computeScreenPricing(merged);
    return { ...merged, ...priced, _openingId: opening._openingId, _lineItemId: opening._lineItemId };
}


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Phase Transitions \u2500\u2500');

test('New opening has phase "opening"', () => {
    const opening = makeOpening();
    assert.strictEqual(opening.phase, 'opening');
});

test('Configured screen has phase "configured"', () => {
    const configured = makeConfigured();
    assert.strictEqual(configured.phase, 'configured');
});

test('Configuring an opening transitions phase to "configured"', () => {
    const opening = makeOpening();
    assert.strictEqual(opening.phase, 'opening');

    const configured = configureOpening(opening, {
        trackType: 'sunair-zipper',
        trackTypeName: 'Sunair Zipper Track',
        operatorType: 'gaposa-rts',
        operatorTypeName: 'Gaposa RTS Motor',
        fabricColor: 'T18FVT061-Espresso',
        fabricColorName: 'Espresso Texture',
        frameColor: 'white',
        frameColorName: 'White'
    });
    assert.strictEqual(configured.phase, 'configured');
});

test('Configured screen has pricing fields populated', () => {
    const configured = makeConfigured();
    assert.ok(configured.customerPrice > 0, 'customerPrice should be set');
    assert.ok(configured.totalCost > 0, 'totalCost should be set');
    assert.ok(typeof configured.installationPrice === 'number', 'installationPrice should be number');
});

test('Opening has no pricing fields', () => {
    const opening = makeOpening();
    assert.strictEqual(opening.customerPrice, undefined);
    assert.strictEqual(opening.totalCost, undefined);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Exclude Toggle \u2500\u2500');

test('toggleExclude flips excluded flag', () => {
    const screen = makeConfigured({ excluded: false });
    screen.excluded = !screen.excluded; // mirrors toggleExclude logic
    assert.strictEqual(screen.excluded, true);
    screen.excluded = !screen.excluded;
    assert.strictEqual(screen.excluded, false);
});

test('Exclude preserves entity IDs', () => {
    const screen = makeConfigured({
        _openingId: 'opening-123',
        _lineItemId: 'lineitem-456',
        excluded: false
    });
    screen.excluded = true;
    assert.strictEqual(screen._openingId, 'opening-123');
    assert.strictEqual(screen._lineItemId, 'lineitem-456');
});

test('Exclude preserves pricing data', () => {
    const screen = makeConfigured();
    const priceBeforeExclude = screen.customerPrice;
    screen.excluded = true;
    assert.strictEqual(screen.customerPrice, priceBeforeExclude,
        'Price should not change when excluding');
});

test('Excluded screens filtered from non-excluded list', () => {
    const screens = [
        makeConfigured({ screenName: 'A', excluded: false }),
        makeConfigured({ screenName: 'B', excluded: true }),
        makeConfigured({ screenName: 'C', excluded: false })
    ];
    const included = screens.filter(s => !s.excluded);
    assert.strictEqual(included.length, 2);
    assert.deepStrictEqual(included.map(s => s.screenName), ['A', 'C']);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Inline Edit Preservation \u2500\u2500');

test('Inline edit (re-pricing) preserves excluded state', () => {
    const screen = makeConfigured({ excluded: true, _openingId: 'op-1', _lineItemId: 'li-1' });

    // Simulate saveInlineEdit: re-compute pricing then restore excluded + IDs
    const repriced = computeScreenPricing(screen);
    repriced._openingId = screen._openingId;
    repriced._lineItemId = screen._lineItemId;
    repriced.excluded = screen.excluded;

    assert.strictEqual(repriced.excluded, true);
    assert.strictEqual(repriced._openingId, 'op-1');
    assert.strictEqual(repriced._lineItemId, 'li-1');
});

test('Inline edit with motor change updates pricing', () => {
    const rtsScreen = makeConfigured({ operatorType: 'gaposa-rts', operatorTypeName: 'Gaposa RTS Motor' });
    const solarScreen = makeConfigured({ operatorType: 'gaposa-solar', operatorTypeName: 'Gaposa Solar' });

    assert.ok(solarScreen.customerPrice > rtsScreen.customerPrice,
        'Solar should be more expensive than RTS');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Duplicate Screen \u2500\u2500');

test('Duplicate deep-copies screen data', () => {
    const original = makeConfigured({
        screenName: 'Original',
        accessories: [{ name: 'Wind Sensor', cost: 100, needsMarkup: true }]
    });
    // Simulate duplicateScreen
    const copy = JSON.parse(JSON.stringify(original));
    copy.screenName = copy.screenName ? `${copy.screenName} (Copy)` : null;
    copy.pendingPhotos = [];

    assert.strictEqual(copy.screenName, 'Original (Copy)');
    assert.deepStrictEqual(copy.accessories, original.accessories);
    // Modifying copy should not affect original
    copy.accessories.push({ name: 'Extra', cost: 50, needsMarkup: false });
    assert.strictEqual(original.accessories.length, 1, 'Original should be unchanged');
});

test('Duplicate clears pending photos', () => {
    const original = makeConfigured({ pendingPhotos: ['blob1', 'blob2'] });
    const copy = JSON.parse(JSON.stringify(original));
    copy.pendingPhotos = [];
    assert.strictEqual(copy.pendingPhotos.length, 0);
    // original unchanged since we used JSON deep copy
});

test('Duplicate preserves excluded state', () => {
    const original = makeConfigured({ excluded: true });
    const copy = JSON.parse(JSON.stringify(original));
    assert.strictEqual(copy.excluded, true);
});

test('Duplicate with null screenName gets " (Copy)" suffix correctly', () => {
    const original = makeConfigured({ screenName: null });
    const copy = JSON.parse(JSON.stringify(original));
    copy.screenName = copy.screenName ? `${copy.screenName} (Copy)` : null;
    assert.strictEqual(copy.screenName, null, 'null name should remain null');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Backward Compatibility \u2500\u2500');

test('Old quote without phase field defaults to "configured"', () => {
    const oldScreen = {
        screenName: 'Legacy Screen',
        trackType: 'sunair-zipper',
        customerPrice: 1000,
        installationPrice: 525,
        // No phase field
    };
    const phase = oldScreen.phase || 'configured';
    assert.strictEqual(phase, 'configured');
});

test('Old quote without excluded field treated as not excluded', () => {
    const oldScreen = { screenName: 'Legacy', customerPrice: 1000 };
    assert.strictEqual(!!oldScreen.excluded, false);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Project Accessories Filtering \u2500\u2500');

test('getApplicableProjectAccessories returns Gaposa items for RTS motor', () => {
    // Simulate the function logic
    global.screensInOrder = [makeConfigured({ operatorType: 'gaposa-rts' })];
    const motorBrands = new Set();
    let hasSolar = false;
    global.screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-rts' || screen.operatorType === 'gaposa-solar') motorBrands.add('gaposa');
        if (screen.operatorType === 'somfy-rts') motorBrands.add('somfy');
        if (screen.operatorType === 'gaposa-solar') hasSolar = true;
    });
    assert.ok(motorBrands.has('gaposa'), 'Should include gaposa brand');
    assert.ok(!motorBrands.has('somfy'), 'Should not include somfy');
    assert.strictEqual(hasSolar, false, 'RTS is not solar');
});

test('Solar extension cord only shown with solar motor', () => {
    global.screensInOrder = [makeConfigured({ operatorType: 'gaposa-solar' })];
    let hasSolar = false;
    global.screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-solar') hasSolar = true;
    });
    assert.strictEqual(hasSolar, true, 'Should detect solar motor');
});

test('No accessories for gear-only screens', () => {
    global.screensInOrder = [makeConfigured({ operatorType: 'gear' })];
    const motorBrands = new Set();
    global.screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-rts' || screen.operatorType === 'gaposa-solar') motorBrands.add('gaposa');
        if (screen.operatorType === 'somfy-rts') motorBrands.add('somfy');
    });
    assert.strictEqual(motorBrands.size, 0, 'Gear screens should have no motor brand accessories');
});

test('Mixed motors: both Gaposa and Somfy accessories available', () => {
    global.screensInOrder = [
        makeConfigured({ operatorType: 'gaposa-rts' }),
        makeConfigured({ operatorType: 'somfy-rts' })
    ];
    const motorBrands = new Set();
    global.screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-rts' || screen.operatorType === 'gaposa-solar') motorBrands.add('gaposa');
        if (screen.operatorType === 'somfy-rts') motorBrands.add('somfy');
    });
    assert.ok(motorBrands.has('gaposa'));
    assert.ok(motorBrands.has('somfy'));
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Quick Config Preferences \u2500\u2500');

test('Quick config preferences stored on opening', () => {
    const opening = makeOpening({
        preferredTrackType: 'sunair-cable',
        preferredOperator: 'gaposa-solar',
        preferredFabric: 'T18FVT064-Carbon',
        preferredFrameColor: 'bronze'
    });
    assert.strictEqual(opening.preferredTrackType, 'sunair-cable');
    assert.strictEqual(opening.preferredOperator, 'gaposa-solar');
});

test('Quick config preferences applied during configuration', () => {
    const opening = makeOpening({
        preferredTrackType: 'sunair-cable',
        preferredOperator: 'gaposa-rts'
    });
    // Simulate: if no explicit selection, use preferred
    const trackType = opening.preferredTrackType || 'sunair-zipper';
    const operatorType = opening.preferredOperator || 'gear';
    assert.strictEqual(trackType, 'sunair-cable');
    assert.strictEqual(operatorType, 'gaposa-rts');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Phase Check Guards \u2500\u2500');

test('Phase check: no unconfigured non-excluded screens = OK', () => {
    const screens = [
        makeConfigured(),
        makeConfigured(),
        makeOpening({ excluded: true })
    ];
    const unconfigured = screens.filter(s => s.phase === 'opening' && !s.excluded);
    assert.strictEqual(unconfigured.length, 0, 'Should pass phase check');
});

test('Phase check: one unconfigured non-excluded = blocked', () => {
    const screens = [
        makeConfigured(),
        makeOpening() // not excluded
    ];
    const unconfigured = screens.filter(s => s.phase === 'opening' && !s.excluded);
    assert.strictEqual(unconfigured.length, 1, 'Should block phase check');
});

test('Phase check: all openings excluded = OK', () => {
    const screens = [
        makeOpening({ excluded: true }),
        makeOpening({ excluded: true })
    ];
    const unconfigured = screens.filter(s => s.phase === 'opening' && !s.excluded);
    assert.strictEqual(unconfigured.length, 0, 'All excluded openings should pass');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
