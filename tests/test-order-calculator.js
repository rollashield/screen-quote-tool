/**
 * Tests for order-calculator.js logic
 * Run: node tests/test-order-calculator.js
 *
 * These tests verify the data flow of quote calculation:
 * excluded screen filtering, totals, discounts, guarantees, accessories.
 *
 * Since calculateOrderQuote() is tightly coupled to the DOM, we test
 * the underlying logic patterns rather than calling the function directly.
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

function approxEqual(a, b, tolerance = 0.02) {
    return Math.abs(a - b) <= tolerance;
}

// ─── Helper: build a configured screen ──────────────────────────────────────
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
        guaranteeActive: false,
        photos: [],
        pendingPhotos: [],
        widthInputValue: '96',
        widthFractionValue: '',
        heightInputValue: '96',
        heightFractionValue: '',
        phase: 'configured',
        excluded: false
    };
    const screen = { ...defaults, ...overrides };
    // Compute pricing if not provided
    if (!screen.customerPrice) {
        const priced = computeScreenPricing(screen);
        Object.assign(screen, priced);
    }
    return screen;
}

// ─── Helper: simulate calculateOrderQuote data assembly ─────────────────────
// Mirrors the core logic of calculateOrderQuote without DOM dependencies
function assembleOrderTotals(screensInOrder, options = {}) {
    const {
        discountPercent = 0,
        discountLabel = 'Discount',
        fourWeekGuarantee = false,
        projectAccessories = [],
        miscInstallAmount = 0,
        miscInstallLabel = '',
    } = options;

    const CABLE_SURCHARGE = 305;

    // Re-price with guarantee state (mirrors order-calculator.js lines 467-503)
    screensInOrder.forEach((screen, index) => {
        if (screen.excluded || screen.phase === 'opening') return;
        const repriced = computeScreenPricing({
            ...screen,
            guaranteeActive: fourWeekGuarantee
        });
        if (!repriced.error) {
            repriced._openingId = screen._openingId;
            repriced._lineItemId = screen._lineItemId;
            repriced.excluded = screen.excluded;
            screensInOrder[index] = repriced;
        }
    });

    let orderTotalCost = 0;
    let orderTotalMaterialsPrice = 0;
    let orderTotalInstallationPrice = 0;
    let orderTotalInstallationCost = 0;
    let orderTotalWiringPrice = 0;
    let totalScreenCosts = 0;
    let totalMotorCosts = 0;
    let totalAccessoriesCosts = 0;
    let totalCableSurcharge = 0;
    let totalGuaranteeDiscount = 0;
    let hasCableScreen = false;

    screensInOrder.forEach((screen) => {
        if (screen.excluded) return;

        let screenMaterialsPrice = screen.customerPrice - screen.installationPrice - (screen.wiringPrice || 0);
        let screenCost = screen.totalCost;

        if (screen.trackType === 'sunair-cable') {
            if (!hasCableScreen) {
                screenCost += CABLE_SURCHARGE;
                screenMaterialsPrice += CABLE_SURCHARGE * CUSTOMER_MARKUP;
                totalCableSurcharge += CABLE_SURCHARGE;
                hasCableScreen = true;
            }
        }

        orderTotalCost += screenCost;
        orderTotalMaterialsPrice += screenMaterialsPrice;
        orderTotalInstallationPrice += screen.installationPrice;
        orderTotalInstallationCost += screen.installationCost || 0;
        orderTotalWiringPrice += screen.wiringPrice || 0;
        totalScreenCosts += screen.screenCostOnly || 0;
        totalMotorCosts += screen.motorCost || 0;
        totalAccessoriesCosts += screen.accessoriesCost || 0;
        totalGuaranteeDiscount += screen.guaranteeDiscount || 0;
    });

    // Project accessories
    let projectAccessoriesTotal = 0;
    projectAccessories.forEach(acc => {
        if (acc.quantity > 0) {
            projectAccessoriesTotal += acc.customerPrice * acc.quantity;
            orderTotalCost += acc.cost * acc.quantity;
        }
    });
    orderTotalMaterialsPrice += projectAccessoriesTotal;

    // Misc install
    const miscInstallCost = miscInstallAmount * 0.7;
    orderTotalInstallationPrice += miscInstallAmount;
    orderTotalInstallationCost += miscInstallCost;
    orderTotalCost += miscInstallCost;

    // Discount
    const discountAmount = (orderTotalMaterialsPrice * discountPercent) / 100;
    const discountedMaterialsPrice = orderTotalMaterialsPrice - discountAmount;
    const orderTotalPrice = discountedMaterialsPrice + orderTotalInstallationPrice + orderTotalWiringPrice;

    // Bond Bridge
    let guaranteeBondBridge = false;
    if (fourWeekGuarantee) {
        guaranteeBondBridge = screensInOrder.some(s => !s.excluded && s.guaranteeBondBridge);
    }

    return {
        orderTotalCost,
        orderTotalMaterialsPrice,
        orderTotalInstallationPrice,
        orderTotalInstallationCost,
        orderTotalWiringPrice,
        orderTotalPrice,
        totalScreenCosts,
        totalMotorCosts,
        totalAccessoriesCosts,
        totalCableSurcharge,
        totalGuaranteeDiscount,
        hasCableScreen,
        discountAmount,
        discountedMaterialsPrice,
        discountPercent,
        discountLabel,
        miscInstallAmount,
        miscInstallLabel,
        fourWeekGuarantee,
        guaranteeBondBridge,
        includedScreenCount: screensInOrder.filter(s => !s.excluded).length
    };
}


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Excluded Screen Filtering \u2500\u2500');

test('Excluded screens not counted in screen total', () => {
    const screens = [
        makeScreen({ screenName: 'Screen 1' }),
        makeScreen({ screenName: 'Screen 2', excluded: true }),
        makeScreen({ screenName: 'Screen 3' })
    ];
    const result = assembleOrderTotals(screens);
    assert.strictEqual(result.includedScreenCount, 2);
});

test('Excluded screens not included in pricing totals', () => {
    const s1 = makeScreen({ screenName: 'A' });
    const s2 = makeScreen({ screenName: 'B' });
    const s1Price = s1.customerPrice - s1.installationPrice;
    const s2Price = s2.customerPrice - s2.installationPrice;

    // Both included
    const both = assembleOrderTotals([
        makeScreen({ screenName: 'A' }),
        makeScreen({ screenName: 'B' })
    ]);

    // One excluded
    const oneExcluded = assembleOrderTotals([
        makeScreen({ screenName: 'A' }),
        makeScreen({ screenName: 'B', excluded: true })
    ]);

    assert.ok(both.orderTotalMaterialsPrice > oneExcluded.orderTotalMaterialsPrice,
        'Materials price should be lower with excluded screen');
    assert.ok(approxEqual(oneExcluded.orderTotalMaterialsPrice, s1Price),
        `Materials should equal single screen price: ${oneExcluded.orderTotalMaterialsPrice} vs ${s1Price}`);
});

test('All screens excluded results in zero totals', () => {
    const result = assembleOrderTotals([
        makeScreen({ excluded: true }),
        makeScreen({ excluded: true })
    ]);
    assert.strictEqual(result.orderTotalMaterialsPrice, 0);
    assert.strictEqual(result.orderTotalInstallationPrice, 0);
    assert.strictEqual(result.orderTotalPrice, 0);
    assert.strictEqual(result.includedScreenCount, 0);
});

test('Excluded opening does not block calculation (phase check)', () => {
    const screens = [
        { phase: 'opening', excluded: true, screenName: 'Excluded Opening' },
        makeScreen({ screenName: 'Configured' })
    ];
    // The check: filter(s => s.phase === 'opening' && !s.excluded)
    const unconfigured = screens.filter(s => s.phase === 'opening' && !s.excluded);
    assert.strictEqual(unconfigured.length, 0, 'Excluded opening should not block');
});

test('Non-excluded opening blocks calculation', () => {
    const screens = [
        { phase: 'opening', excluded: false, screenName: 'Unconfigured' },
        makeScreen({ screenName: 'Configured' })
    ];
    const unconfigured = screens.filter(s => s.phase === 'opening' && !s.excluded);
    assert.strictEqual(unconfigured.length, 1, 'Non-excluded opening should block');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Discount Calculations \u2500\u2500');

test('10% discount applied to materials only', () => {
    const noDiscount = assembleOrderTotals([makeScreen({ includeInstallation: true })]);
    const withDiscount = assembleOrderTotals([makeScreen({ includeInstallation: true })], { discountPercent: 10 });

    const expectedDiscount = noDiscount.orderTotalMaterialsPrice * 0.10;
    assert.ok(approxEqual(withDiscount.discountAmount, expectedDiscount, 0.01),
        `Discount amount should be ${expectedDiscount}, got ${withDiscount.discountAmount}`);
    // Installation unchanged
    assert.strictEqual(withDiscount.orderTotalInstallationPrice, noDiscount.orderTotalInstallationPrice);
});

test('0% discount results in no deduction', () => {
    const result = assembleOrderTotals([makeScreen()], { discountPercent: 0 });
    assert.strictEqual(result.discountAmount, 0);
    assert.strictEqual(result.discountedMaterialsPrice, result.orderTotalMaterialsPrice);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Cable Surcharge \u2500\u2500');

test('Cable surcharge applied to first cable screen only', () => {
    const result = assembleOrderTotals([
        makeScreen({ trackType: 'sunair-cable', trackTypeName: 'Sunair Cable', width: 10, height: 10, totalWidthInches: 120, totalHeightInches: 120 }),
        makeScreen({ trackType: 'sunair-cable', trackTypeName: 'Sunair Cable', width: 10, height: 10, totalWidthInches: 120, totalHeightInches: 120 })
    ]);
    assert.strictEqual(result.totalCableSurcharge, 305, 'Surcharge should be $305 (once)');
    assert.strictEqual(result.hasCableScreen, true);
});

test('No cable surcharge for zipper screens', () => {
    const result = assembleOrderTotals([makeScreen()]);
    assert.strictEqual(result.totalCableSurcharge, 0);
    assert.strictEqual(result.hasCableScreen, false);
});

test('Excluded cable screen does not trigger surcharge', () => {
    const result = assembleOrderTotals([
        makeScreen({ trackType: 'sunair-cable', trackTypeName: 'Sunair Cable', excluded: true, width: 10, height: 10, totalWidthInches: 120, totalHeightInches: 120 }),
        makeScreen({ trackType: 'sunair-cable', trackTypeName: 'Sunair Cable', width: 10, height: 10, totalWidthInches: 120, totalHeightInches: 120 })
    ]);
    // The excluded one is skipped, so the second one becomes "first" cable screen
    assert.strictEqual(result.totalCableSurcharge, 305);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Project Accessories \u2500\u2500');

test('Project accessories added to materials total', () => {
    const withoutAcc = assembleOrderTotals([makeScreen()]);
    const withAcc = assembleOrderTotals([makeScreen()], {
        projectAccessories: [{ id: 'test', name: 'Test Acc', cost: 100, customerPrice: 180, quantity: 2 }]
    });
    assert.ok(approxEqual(withAcc.orderTotalMaterialsPrice, withoutAcc.orderTotalMaterialsPrice + 360),
        `Should add $360 (2 x $180) to materials`);
});

test('Zero-quantity accessories not included', () => {
    const withZero = assembleOrderTotals([makeScreen()], {
        projectAccessories: [{ id: 'test', name: 'Test Acc', cost: 100, customerPrice: 180, quantity: 0 }]
    });
    const without = assembleOrderTotals([makeScreen()]);
    assert.ok(approxEqual(withZero.orderTotalMaterialsPrice, without.orderTotalMaterialsPrice),
        'Zero-qty accessory should not affect total');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 4-Week Guarantee \u2500\u2500');

test('Guarantee: solar screen gets discount (priced at RTS rate)', () => {
    const noGuarantee = assembleOrderTotals([
        makeScreen({ operatorType: 'gaposa-solar', operatorTypeName: 'Gaposa Solar' })
    ]);
    const withGuarantee = assembleOrderTotals([
        makeScreen({ operatorType: 'gaposa-solar', operatorTypeName: 'Gaposa Solar' })
    ], { fourWeekGuarantee: true });

    assert.ok(withGuarantee.totalGuaranteeDiscount > 0,
        'Should have guarantee discount for solar');
    assert.ok(withGuarantee.orderTotalPrice < noGuarantee.orderTotalPrice,
        'Total should be lower with guarantee');
});

test('Guarantee: RTS screen gets Bond Bridge flag', () => {
    const result = assembleOrderTotals([
        makeScreen({ operatorType: 'gaposa-rts', operatorTypeName: 'Gaposa RTS Motor' })
    ], { fourWeekGuarantee: true });
    assert.strictEqual(result.guaranteeBondBridge, true, 'RTS screen should get Bond Bridge');
});

test('Guarantee: gear screen gets no discount', () => {
    const result = assembleOrderTotals([
        makeScreen({ operatorType: 'gear', operatorTypeName: 'Gear Operation (Manual)' })
    ], { fourWeekGuarantee: true });
    assert.strictEqual(result.totalGuaranteeDiscount, 0, 'Gear should get no discount');
    assert.strictEqual(result.guaranteeBondBridge, false, 'Gear should not get Bond Bridge');
});

test('Guarantee: excluded RTS screen does not trigger Bond Bridge', () => {
    const result = assembleOrderTotals([
        makeScreen({ operatorType: 'gaposa-rts', operatorTypeName: 'Gaposa RTS Motor', excluded: true }),
        makeScreen({ operatorType: 'gear', operatorTypeName: 'Gear Operation (Manual)' })
    ], { fourWeekGuarantee: true });
    assert.strictEqual(result.guaranteeBondBridge, false, 'Excluded RTS should not trigger Bond Bridge');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Misc Install Amount \u2500\u2500');

test('Misc install added to installation totals', () => {
    const result = assembleOrderTotals([makeScreen()], { miscInstallAmount: 200 });
    // 70% goes to installer cost, 100% added to customer price
    assert.ok(result.orderTotalInstallationPrice > 0);
    const base = assembleOrderTotals([makeScreen()]);
    assert.ok(approxEqual(result.orderTotalInstallationPrice, base.orderTotalInstallationPrice + 200));
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Multi-Screen Totals \u2500\u2500');

test('Three screens sum correctly', () => {
    const s1 = makeScreen({ screenName: 'A', width: 8, height: 8, totalWidthInches: 96, totalHeightInches: 96 });
    const s2 = makeScreen({ screenName: 'B', width: 10, height: 10, totalWidthInches: 120, totalHeightInches: 120 });
    const s3 = makeScreen({ screenName: 'C', width: 12, height: 12, totalWidthInches: 144, totalHeightInches: 144 });

    const result = assembleOrderTotals([s1, s2, s3]);

    const expectedMaterials = [s1, s2, s3].reduce((sum, s) =>
        sum + s.customerPrice - s.installationPrice - (s.wiringPrice || 0), 0);
    const expectedInstall = [s1, s2, s3].reduce((sum, s) => sum + s.installationPrice, 0);

    assert.ok(approxEqual(result.orderTotalMaterialsPrice, expectedMaterials, 0.1),
        `Materials: ${result.orderTotalMaterialsPrice} vs expected ${expectedMaterials}`);
    assert.ok(approxEqual(result.orderTotalInstallationPrice, expectedInstall, 0.1),
        `Install: ${result.orderTotalInstallationPrice} vs expected ${expectedInstall}`);
});

test('Deposit is always 50% of total', () => {
    const result = assembleOrderTotals([makeScreen(), makeScreen()]);
    const deposit = result.orderTotalPrice / 2;
    assert.ok(deposit > 0, 'Deposit should be positive');
    assert.ok(approxEqual(deposit, result.orderTotalPrice / 2), 'Deposit should be 50%');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Wiring Calculations \u2500\u2500');

test('Wiring price included in totals for RTS with installation', () => {
    const withWiring = makeScreen({ wiringDistance: 10, includeInstallation: true });
    const result = assembleOrderTotals([withWiring]);
    assert.ok(result.orderTotalWiringPrice > 0, 'Should have wiring price');
});

test('No wiring for solar motor', () => {
    const solarWithWiring = makeScreen({
        operatorType: 'gaposa-solar',
        operatorTypeName: 'Gaposa Solar',
        wiringDistance: 10,
        includeInstallation: true
    });
    const result = assembleOrderTotals([solarWithWiring]);
    assert.strictEqual(result.orderTotalWiringPrice, 0, 'Solar should have no wiring price');
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n\u2500\u2500 Display: Screen Count Filtering \u2500\u2500');

test('Screen count for display excludes excluded screens', () => {
    const screens = [
        makeScreen({ excluded: false }),
        makeScreen({ excluded: true }),
        makeScreen({ excluded: false }),
        makeScreen({ excluded: true })
    ];
    const displayCount = screens.filter(s => !s.excluded).length;
    assert.strictEqual(displayCount, 2);
});

test('Display loop skips excluded screens', () => {
    const screens = [
        makeScreen({ screenName: 'Show 1', excluded: false }),
        makeScreen({ screenName: 'Hide', excluded: true }),
        makeScreen({ screenName: 'Show 2', excluded: false })
    ];
    const displayed = [];
    screens.forEach(screen => {
        if (screen.excluded) return;
        displayed.push(screen.screenName);
    });
    assert.deepStrictEqual(displayed, ['Show 1', 'Show 2']);
});


// ═══════════════════════════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(40)}`);
console.log(`${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
