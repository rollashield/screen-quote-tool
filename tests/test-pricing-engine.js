/**
 * test-pricing-engine.js
 * Unit tests for pricing-engine.js pure functions.
 * Run: node tests/test-pricing-engine.js
 * No npm, no framework — plain Node.js assert.
 */

const assert = require('assert');

// Load pricing data globals into Node's global scope (mimics browser <script> load order)
const pricingData = require('../pricing-data.js');
Object.assign(global, pricingData);

const pe = require('../pricing-engine.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (e) {
        failed++;
        console.error(`  ✗ ${name}`);
        console.error(`    ${e.message}`);
    }
}

function approxEqual(a, b, tolerance) {
    tolerance = tolerance || 0.01;
    return Math.abs(a - b) < tolerance;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── parseFraction ──');

test('"1/2" → 0.5', () => {
    assert.strictEqual(pe.parseFraction('1/2'), 0.5);
});

test('"3/8" → 0.375', () => {
    assert.strictEqual(pe.parseFraction('3/8'), 0.375);
});

test('"5/16" → 0.3125', () => {
    assert.strictEqual(pe.parseFraction('5/16'), 0.3125);
});

test('"" → 0', () => {
    assert.strictEqual(pe.parseFraction(''), 0);
});

test('null → 0', () => {
    assert.strictEqual(pe.parseFraction(null), 0);
});

test('"bad" → 0', () => {
    assert.strictEqual(pe.parseFraction('bad'), 0);
});

test('"5/0" → 0 (division by zero)', () => {
    assert.strictEqual(pe.parseFraction('5/0'), 0);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── inchesToFeetAndInches ──');

test('60 → 5\' 0"', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(60), "5' 0\"");
});

test('63 → 5\' 3"', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(63), "5' 3\"");
});

test('63.5 → 5\' 3.5"', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(63.5), "5' 3.5\"");
});

test('8 → 0\' 8"', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(8), "0' 8\"");
});

test('0 → 0\' 0"', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(0), "0' 0\"");
});

test('71.875 → 5\' 11.875" (exact 1/8 rounding)', () => {
    assert.strictEqual(pe.inchesToFeetAndInches(71.875), "5' 11.875\"");
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── formatCurrency ──');

test('1234.56 → "$1,234.56"', () => {
    assert.strictEqual(pe.formatCurrency(1234.56), '$1,234.56');
});

test('1000000 → "$1,000,000.00"', () => {
    assert.strictEqual(pe.formatCurrency(1000000), '$1,000,000.00');
});

test('99.5 → "$99.50"', () => {
    assert.strictEqual(pe.formatCurrency(99.5), '$99.50');
});

test('0 → "$0.00"', () => {
    assert.strictEqual(pe.formatCurrency(0), '$0.00');
});

test('0.1 → "$0.10"', () => {
    assert.strictEqual(pe.formatCurrency(0.1), '$0.10');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── Option Lookups ──');

test('getTrackTypeOptions returns 3 items', () => {
    assert.strictEqual(pe.getTrackTypeOptions().length, 3);
});

test('getTrackTypeName("sunair-zipper") → "Sunair Zipper Track"', () => {
    assert.strictEqual(pe.getTrackTypeName('sunair-zipper'), 'Sunair Zipper Track');
});

test('getTrackTypeName("sunair-cable") → "Sunair Cable"', () => {
    assert.strictEqual(pe.getTrackTypeName('sunair-cable'), 'Sunair Cable');
});

test('getTrackTypeName("invalid") → ""', () => {
    assert.strictEqual(pe.getTrackTypeName('invalid'), '');
});

test('getOperatorOptionsForTrack("sunair-zipper", false) returns 4 items (includes Somfy)', () => {
    assert.strictEqual(pe.getOperatorOptionsForTrack('sunair-zipper', false).length, 4);
});

test('getOperatorOptionsForTrack("sunair-zipper", true) returns 3 items (excludes Somfy for guarantee)', () => {
    assert.strictEqual(pe.getOperatorOptionsForTrack('sunair-zipper', true).length, 3);
});

test('getOperatorOptionsForTrack("fenetex-keder", false) returns 1 item', () => {
    assert.strictEqual(pe.getOperatorOptionsForTrack('fenetex-keder', false).length, 1);
});

test('getOperatorOptionsForTrack(null, false) returns []', () => {
    assert.strictEqual(pe.getOperatorOptionsForTrack(null, false).length, 0);
});

test('getOperatorTypeName("sunair-zipper", "gear") → "Gear Operation (Manual)"', () => {
    assert.strictEqual(pe.getOperatorTypeName('sunair-zipper', 'gear'), 'Gear Operation (Manual)');
});

test('getFabricOptions returns 12 items', () => {
    assert.strictEqual(pe.getFabricOptions().length, 12);
});

test('getFabricName("T18FVT061-Espresso") → "Espresso Texture"', () => {
    assert.strictEqual(pe.getFabricName('T18FVT061-Espresso'), 'Espresso Texture');
});

test('getFabricName("invalid") → ""', () => {
    assert.strictEqual(pe.getFabricName('invalid'), '');
});

test('getFrameColorOptions returns 7 items', () => {
    assert.strictEqual(pe.getFrameColorOptions().length, 7);
});

test('getFrameColorName("black") → "Black"', () => {
    assert.strictEqual(pe.getFrameColorName('black'), 'Black');
});

test('getFrameColorName("invalid") → ""', () => {
    assert.strictEqual(pe.getFrameColorName('invalid'), '');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── escapeAttr ──');

test('null → ""', () => {
    assert.strictEqual(pe.escapeAttr(null), '');
});

test('"hello" → "hello"', () => {
    assert.strictEqual(pe.escapeAttr('hello'), 'hello');
});

test('"a&b" → "a&amp;b"', () => {
    assert.strictEqual(pe.escapeAttr('a&b'), 'a&amp;b');
});

test('"<\\"test\\">" → "&lt;&quot;test&quot;&gt;"', () => {
    assert.strictEqual(pe.escapeAttr('<"test">'), '&lt;&quot;test&quot;&gt;');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── buildSelectOptionsHtml ──');

test('builds options with placeholder and selection', () => {
    const html = pe.buildSelectOptionsHtml(
        [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }],
        'b',
        'Choose...'
    );
    assert(html.includes('Choose...'));
    assert(html.includes('value="a"'));
    assert(html.includes('value="b"'));
    assert(html.includes(' selected'));
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── getClientFacingOperatorName ──');

test('"gear" → "Manual Gear Operation"', () => {
    assert.strictEqual(pe.getClientFacingOperatorName('gear', 'whatever'), 'Manual Gear Operation');
});

test('"gaposa-rts" → "Remote-Operated Motor"', () => {
    assert.strictEqual(pe.getClientFacingOperatorName('gaposa-rts', ''), 'Remote-Operated Motor');
});

test('"gaposa-solar" → "Solar Motor"', () => {
    assert.strictEqual(pe.getClientFacingOperatorName('gaposa-solar', ''), 'Solar Motor');
});

test('"somfy-rts" → "Remote-Operated Motor"', () => {
    assert.strictEqual(pe.getClientFacingOperatorName('somfy-rts', ''), 'Remote-Operated Motor');
});

test('"unknown" falls back to second param', () => {
    assert.strictEqual(pe.getClientFacingOperatorName('unknown', 'Fallback Name'), 'Fallback Name');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── getClientFacingTrackName ──');

test('"Sunair Zipper Track" → "Zipper Track"', () => {
    assert.strictEqual(pe.getClientFacingTrackName('Sunair Zipper Track'), 'Zipper Track');
});

test('"Fenetex Keder Track" → "Keder Track"', () => {
    assert.strictEqual(pe.getClientFacingTrackName('Fenetex Keder Track'), 'Keder Track');
});

test('"Other" → "Other"', () => {
    assert.strictEqual(pe.getClientFacingTrackName('Other'), 'Other');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── computeScreenPricing (CRITICAL) ──');

// Helper to build a standard screen input
function makeScreen(overrides) {
    return Object.assign({
        screenName: 'Test Screen',
        trackType: 'sunair-zipper',
        trackTypeName: 'Sunair Zipper Track',
        operatorType: 'gear',
        operatorTypeName: 'Gear Operation (Manual)',
        fabricColor: 'T18FVT061-Espresso',
        fabricColorName: 'Espresso Texture',
        frameColor: 'black',
        frameColorName: 'Black',
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
        guaranteeActive: false,
        photos: [],
        pendingPhotos: [],
        widthInputValue: '96',
        widthFractionValue: '',
        heightInputValue: '96',
        heightFractionValue: ''
    }, overrides);
}

test('Sunair zipper + gear 8x8: correct base cost, no motor', () => {
    const result = pe.computeScreenPricing(makeScreen());
    assert(!result.error, 'Should not have error');
    // sunairZipperGear[8][8] = 1473.07, ×0.8 discount = 1178.456
    const expectedScreenCost = 1473.07 * 0.8;
    assert(approxEqual(result.screenCostOnly, expectedScreenCost), `screenCostOnly: ${result.screenCostOnly} ≈ ${expectedScreenCost}`);
    assert.strictEqual(result.motorCost, 0);
});

test('Sunair zipper + gaposa-rts 8x8: motor $225 added', () => {
    const result = pe.computeScreenPricing(makeScreen({ operatorType: 'gaposa-rts' }));
    assert(!result.error);
    assert.strictEqual(result.motorCost, 225);
    assert(result.customerPrice > 0);
});

test('Sunair zipper + gaposa-solar 8x8: motor $425, no wiring', () => {
    const result = pe.computeScreenPricing(makeScreen({ operatorType: 'gaposa-solar', wiringDistance: 10 }));
    assert(!result.error);
    assert.strictEqual(result.motorCost, 425);
    assert.strictEqual(result.wiringPrice, 0, 'Solar motors should not have wiring');
});

test('Sunair zipper + somfy-rts 8x8: motor $375', () => {
    const result = pe.computeScreenPricing(makeScreen({ operatorType: 'somfy-rts' }));
    assert(!result.error);
    assert.strictEqual(result.motorCost, 375);
});

test('Sunair cable + rts 10x10: correct cable table lookup', () => {
    const result = pe.computeScreenPricing(makeScreen({
        trackType: 'sunair-cable',
        trackTypeName: 'Sunair Cable',
        operatorType: 'gaposa-rts',
        width: 10, height: 10
    }));
    assert(!result.error);
    const expectedScreenCost = sunairCableGear['10']['10'] * 0.8;
    assert(approxEqual(result.screenCostOnly, expectedScreenCost), `Cable screenCostOnly: ${result.screenCostOnly} ≈ ${expectedScreenCost}`);
});

test('Fenetex keder + rts 8x8: 1.2x markup, no separate motor cost', () => {
    const result = pe.computeScreenPricing(makeScreen({
        trackType: 'fenetex-keder',
        trackTypeName: 'Fenetex Keder Track',
        operatorType: 'gaposa-rts',
        operatorTypeName: 'Gaposa RTS Motor (Included)'
    }));
    assert(!result.error);
    assert(result.isFenetex);
    // Fenetex customer price = (sunairZipper8x8 * 0.8 + 225) * 1.8 * 1.2
    const sunairCost = sunairZipperGear['8']['8'] * 0.8;
    const expectedCustomerBase = (sunairCost + 225) * 1.8 * 1.2;
    // Installation added on top
    assert(approxEqual(result.customerPrice - result.installationPrice, expectedCustomerBase),
        `Fenetex price: ${result.customerPrice - result.installationPrice} ≈ ${expectedCustomerBase}`);
});

test('Installation small RTS: $525', () => {
    const result = pe.computeScreenPricing(makeScreen({ operatorType: 'gaposa-rts', includeInstallation: true }));
    assert.strictEqual(result.installationPrice, 525);
});

test('Installation large (12+) solar: $600', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-solar', width: 12, height: 8, includeInstallation: true
    }));
    assert.strictEqual(result.installationPrice, 600);
});

test('Installation large (12+) RTS: $700', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-rts', width: 12, height: 8, includeInstallation: true
    }));
    assert.strictEqual(result.installationPrice, 700);
});

test('Installation small solar: $400', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-solar', includeInstallation: true
    }));
    assert.strictEqual(result.installationPrice, 400);
});

test('No installation: installationPrice = 0', () => {
    const result = pe.computeScreenPricing(makeScreen({ includeInstallation: false }));
    assert.strictEqual(result.installationPrice, 0);
    assert.strictEqual(result.installationCost, 0);
});

test('Wiring 10 feet with RTS: $100 base + $120 per-foot = $220 wiring price', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-rts', wiringDistance: 10, includeInstallation: true
    }));
    assert.strictEqual(result.wiringPrice, 220);  // $100 base + 10 × $12/ft
    assert.strictEqual(result.wiringCost, 220);    // $30 material + $70 labor + 10 × $12/ft
    assert.strictEqual(result.wiringDistance, 10);
});

test('Wiring with solar motor: skipped (wiringPrice = 0)', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-solar', wiringDistance: 24, includeInstallation: true
    }));
    assert.strictEqual(result.wiringPrice, 0);
});

test('4-week guarantee + solar: solar priced at RTS rate', () => {
    const withGuarantee = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-solar', guaranteeActive: true
    }));
    const withoutGuarantee = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-solar', guaranteeActive: false
    }));
    const expectedDiscount = (425 - 225) * 1.8; // $360
    assert(approxEqual(withGuarantee.guaranteeDiscount, expectedDiscount),
        `guaranteeDiscount: ${withGuarantee.guaranteeDiscount} ≈ ${expectedDiscount}`);
    assert(withGuarantee.customerPrice < withoutGuarantee.customerPrice,
        'Guarantee should reduce customer price for solar');
});

test('4-week guarantee + RTS: guaranteeBondBridge = true, guaranteeDiscount = 0', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-rts', guaranteeActive: true
    }));
    assert.strictEqual(result.guaranteeBondBridge, true);
    assert.strictEqual(result.guaranteeDiscount, 0);
});

test('4-week guarantee + gear: no Bond Bridge, no discount', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gear', guaranteeActive: true
    }));
    assert.strictEqual(result.guaranteeBondBridge, false);
    assert.strictEqual(result.guaranteeDiscount, 0);
});

test('No guarantee + RTS: guaranteeBondBridge = false', () => {
    const result = pe.computeScreenPricing(makeScreen({
        operatorType: 'gaposa-rts', guaranteeActive: false
    }));
    assert.strictEqual(result.guaranteeBondBridge, false);
});

test('Track deduction (noTracks=true): height-based deduction applied', () => {
    const withTracks = pe.computeScreenPricing(makeScreen({ noTracks: false }));
    const withoutTracks = pe.computeScreenPricing(makeScreen({ noTracks: true }));
    assert(withoutTracks.trackDeduction < 0, 'trackDeduction should be negative');
    assert(withoutTracks.customerPrice < withTracks.customerPrice,
        'No-tracks should be cheaper');
});

test('Accessories with markup: cost × 1.8', () => {
    const result = pe.computeScreenPricing(makeScreen({
        accessories: [{ id: 'test', name: 'Test', cost: 100, needsMarkup: true }]
    }));
    // Without accessory
    const base = pe.computeScreenPricing(makeScreen());
    assert(approxEqual(result.customerPrice - base.customerPrice, 100 * 1.8),
        `Markup accessory delta: ${result.customerPrice - base.customerPrice} ≈ ${100 * 1.8}`);
});

test('Accessories without markup: cost passed through', () => {
    const result = pe.computeScreenPricing(makeScreen({
        accessories: [{ id: 'test', name: 'Test', cost: 100, needsMarkup: false }]
    }));
    const base = pe.computeScreenPricing(makeScreen());
    assert(approxEqual(result.customerPrice - base.customerPrice, 100),
        `No-markup accessory delta: ${result.customerPrice - base.customerPrice} ≈ 100`);
});

test('Invalid dimensions: returns error object', () => {
    const result = pe.computeScreenPricing(makeScreen({ width: 99, height: 99 }));
    assert(result.error, 'Should return error for invalid dimensions');
    assert(result.error.includes('No pricing available'));
});

test('Sunair discount: 20% applied to screen cost', () => {
    const result = pe.computeScreenPricing(makeScreen());
    const rawCost = sunairZipperGear['8']['8'];
    assert(approxEqual(result.screenCostOnly, rawCost * 0.8),
        `screenCostOnly ${result.screenCostOnly} ≈ ${rawCost * 0.8}`);
});

test('Customer markup: 1.8x on screen + motor costs', () => {
    // Gear (no motor, no install, no accessories) → customerPrice = screenCost × 1.8
    const result = pe.computeScreenPricing(makeScreen({ includeInstallation: false }));
    assert(approxEqual(result.customerPrice, result.screenCostOnly * 1.8),
        `customerPrice ${result.customerPrice} ≈ ${result.screenCostOnly * 1.8}`);
});

test('Fabric multiplier 90%: screen cost × 0.9636', () => {
    const standard = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT061-Espresso' }));
    const ninety = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT-Black90' }));
    const ratio = ninety.screenCostOnly / standard.screenCostOnly;
    assert(approxEqual(ratio, 0.9636, 0.001),
        `90% fabric ratio: ${ratio} ≈ 0.9636`);
});

test('Fabric multiplier 97%: screen cost × 1.1261', () => {
    const standard = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT061-Espresso' }));
    const ninetySeven = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT-Black97' }));
    const ratio = ninetySeven.screenCostOnly / standard.screenCostOnly;
    assert(approxEqual(ratio, 1.1261, 0.001),
        `97% fabric ratio: ${ratio} ≈ 1.1261`);
});

test('Fabric multiplier Tuffscreen: screen cost × 0.8112', () => {
    const standard = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT061-Espresso' }));
    const tuff = pe.computeScreenPricing(makeScreen({ fabricColor: 'T18FVT-Tuffscreen' }));
    const ratio = tuff.screenCostOnly / standard.screenCostOnly;
    assert(approxEqual(ratio, 0.8112, 0.001),
        `Tuffscreen fabric ratio: ${ratio} ≈ 0.8112`);
});

test('Fenetex ignores fabric multiplier', () => {
    const standard = pe.computeScreenPricing(makeScreen({
        trackType: 'fenetex-keder', trackTypeName: 'Fenetex Keder Track',
        operatorType: 'gaposa-rts', fabricColor: 'T18FVT061-Espresso'
    }));
    const ninety = pe.computeScreenPricing(makeScreen({
        trackType: 'fenetex-keder', trackTypeName: 'Fenetex Keder Track',
        operatorType: 'gaposa-rts', fabricColor: 'T18FVT-Black90'
    }));
    assert(approxEqual(standard.customerPrice, ninety.customerPrice),
        'Fenetex price should be same regardless of fabric');
});

test('Returns phase: "configured"', () => {
    const result = pe.computeScreenPricing(makeScreen());
    assert.strictEqual(result.phase, 'configured');
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── calculateScreenWithAlternateMotor ──');

// Build a "configured screen" object as returned by computeScreenPricing
function makeConfiguredScreen(overrides) {
    const input = makeScreen(overrides);
    return pe.computeScreenPricing(input);
}

test('Gear comparison: removes motor cost, skips accessories', () => {
    const screen = makeConfiguredScreen({
        operatorType: 'gaposa-rts',
        accessories: [{ id: 'remote', name: 'Remote', cost: 50, needsMarkup: true }]
    });
    const gearResult = pe.calculateScreenWithAlternateMotor(screen, 'gear', false);
    assert.strictEqual(gearResult.motorCost, 0, 'Gear has no motor cost');
    // Gear comparison should skip accessories
    const gearNoAcc = pe.calculateScreenWithAlternateMotor(
        makeConfiguredScreen({ operatorType: 'gaposa-rts' }),
        'gear', false
    );
    assert(approxEqual(gearResult.customerPrice, gearNoAcc.customerPrice),
        'Gear comparison should skip accessories');
});

test('RTS comparison: includes accessories', () => {
    const screen = makeConfiguredScreen({
        operatorType: 'gear',
        accessories: [{ id: 'remote', name: 'Remote', cost: 50, needsMarkup: true }]
    });
    const rtsResult = pe.calculateScreenWithAlternateMotor(screen, 'gaposa-rts', false);
    const rtsNoAcc = pe.calculateScreenWithAlternateMotor(
        makeConfiguredScreen({ operatorType: 'gear' }),
        'gaposa-rts', false
    );
    assert(rtsResult.customerPrice > rtsNoAcc.customerPrice,
        'RTS comparison should include accessories');
});

test('Solar + guarantee: priced at RTS rate', () => {
    const screen = makeConfiguredScreen({ operatorType: 'gaposa-rts' });
    const solarNoGuarantee = pe.calculateScreenWithAlternateMotor(screen, 'gaposa-solar', false);
    const solarWithGuarantee = pe.calculateScreenWithAlternateMotor(screen, 'gaposa-solar', true);
    assert(solarWithGuarantee.customerPrice < solarNoGuarantee.customerPrice,
        'Solar with guarantee should be cheaper');
    assert.strictEqual(solarWithGuarantee.motorCost, 425, 'Motor cost is still $425 (cost, not price)');
});

test('Returns correct structure', () => {
    const screen = makeConfiguredScreen({ operatorType: 'gear' });
    const result = pe.calculateScreenWithAlternateMotor(screen, 'gaposa-rts', false);
    assert('customerPrice' in result);
    assert('motorCost' in result);
    assert('materialPrice' in result);
    assert.strictEqual(result.materialPrice, result.customerPrice - screen.installationPrice);
});

test('Same motor returns same price as original', () => {
    const screen = makeConfiguredScreen({ operatorType: 'gaposa-rts' });
    const result = pe.calculateScreenWithAlternateMotor(screen, 'gaposa-rts', false);
    // Should be approximately the same as original customer price
    assert(approxEqual(result.customerPrice, screen.customerPrice, 0.02),
        `Same motor comparison: ${result.customerPrice} ≈ ${screen.customerPrice}`);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n── calculateScreenWithAlternateTrack ──');

test('Zipper → cable: valid, returns pricing', () => {
    const screen = makeConfiguredScreen({
        trackType: 'sunair-zipper', operatorType: 'gaposa-rts', width: 8, height: 8
    });
    const result = pe.calculateScreenWithAlternateTrack(screen, 'sunair-cable', false);
    assert(result !== null, 'Should return pricing for valid dimensions');
    assert(result.customerPrice > 0);
    assert(result.materialPrice > 0);
});

test('Cable → Fenetex: forces gaposa-rts operator', () => {
    const screen = makeConfiguredScreen({
        trackType: 'sunair-cable', operatorType: 'somfy-rts', width: 8, height: 8
    });
    const result = pe.calculateScreenWithAlternateTrack(screen, 'fenetex-keder', false);
    assert(result !== null, 'Fenetex should be valid at 8x8');
    assert(result.customerPrice > 0);
});

test('Invalid dimensions for target track: returns null', () => {
    const screen = makeConfiguredScreen({
        trackType: 'sunair-zipper', operatorType: 'gaposa-rts', width: 24, height: 10
    });
    // Cable goes up to 22 wide, 24 is beyond
    const result = pe.calculateScreenWithAlternateTrack(screen, 'sunair-cable', false);
    assert(result === null, 'Should return null for incompatible dimensions');
});

test('Zipper → Fenetex at dimensions too large: returns null', () => {
    const screen = makeConfiguredScreen({
        trackType: 'sunair-zipper', operatorType: 'gaposa-rts', width: 22, height: 10
    });
    // Fenetex max width is 20
    const result = pe.calculateScreenWithAlternateTrack(screen, 'fenetex-keder', false);
    assert(result === null, 'Should return null for Fenetex at 22ft wide');
});

test('Returns customerPrice and materialPrice structure', () => {
    const screen = makeConfiguredScreen({
        trackType: 'sunair-zipper', operatorType: 'gaposa-rts', width: 8, height: 8
    });
    const result = pe.calculateScreenWithAlternateTrack(screen, 'sunair-cable', false);
    assert('customerPrice' in result);
    assert('materialPrice' in result);
});

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n══════════════════════════════════════');
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
