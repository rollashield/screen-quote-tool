/**
 * estimate.js
 * Rough estimate calculator for Rolling Screens & Shutters.
 * References pricing-data.js (screens) and shutter-pricing-prep.js (shutters).
 */

const LAST_PRICING_UPDATE = 'March 2026';

document.addEventListener('DOMContentLoaded', function () {
    const productType = document.getElementById('productType');
    const slatGroup = document.getElementById('slatGroup');
    const calcBtn = document.getElementById('calcBtn');
    const resultsDiv = document.getElementById('results');

    productType.addEventListener('change', function () {
        slatGroup.classList.toggle('hidden', this.value !== 'shutter');
        resultsDiv.classList.add('hidden');
    });

    calcBtn.addEventListener('click', calculateEstimate);
});

// ─── Main entry point ────────────────────────────────────────────────────────

function calculateEstimate() {
    const productType = document.getElementById('productType').value;
    const widthFt = parseFloat(document.getElementById('width').value);
    const heightFt = parseFloat(document.getElementById('height').value);
    const operation = document.getElementById('operation').value;

    if (!widthFt || !heightFt || widthFt <= 0 || heightFt <= 0) {
        showError('Please enter valid width and height.');
        return;
    }

    let result;
    if (productType === 'screen') {
        result = estimateScreen(widthFt, heightFt, operation);
    } else {
        const slatCategory = document.getElementById('slatCategory').value;
        result = estimateShutter(widthFt, heightFt, operation, slatCategory);
    }

    if (result.error) {
        showError(result.error);
    } else {
        showResult(result);
    }
}

// ─── Screen estimate ─────────────────────────────────────────────────────────

function estimateScreen(widthFt, heightFt, operation) {
    // Round up to next whole foot for table lookup
    const w = Math.ceil(widthFt);
    const h = Math.ceil(heightFt);

    if (w < 3 || w > 24) {
        return { error: 'Screen width must be between 3 and 24 feet.' };
    }
    if (h < 4 || h > 16) {
        return { error: 'Screen height must be between 4 and 16 feet.' };
    }

    const tableCost = sunairZipperGear[String(w)] && sunairZipperGear[String(w)][String(h)];
    if (tableCost === null || tableCost === undefined) {
        return { error: 'No pricing available for this screen size. The width/height combination may exceed maximum dimensions.' };
    }

    // Pipeline: table cost → fabric (1.0 for Nano 95) → Sunair discount → customer markup
    const discountedCost = tableCost * (1 - SUNAIR_DISCOUNT);
    const screenPrice = discountedCost * CUSTOMER_MARKUP;

    // Motor cost (RTS for motorized, none for gear)
    let motorPrice = 0;
    if (operation === 'motorized') {
        motorPrice = motorCosts['gaposa-rts'] * CUSTOMER_MARKUP; // $225 × 1.8 = $405
    }

    const productPrice = Math.round(screenPrice + motorPrice);

    // Installation (non-solar pricing for both gear and RTS)
    const isLarge = w >= 12;
    const installPrice = isLarge
        ? installationPricing['rts-large']   // $700
        : installationPricing['rts-small'];  // $525

    const assumptions = [
        'Sunair zipper track',
        operation === 'manual' ? 'Gear operation (manual crank)' : 'Gaposa RTS motor (wireless remote)',
        'Nano 95 standard fabric',
        'Standard frame color',
        'Includes installation labor',
    ];
    if (operation === 'motorized') {
        assumptions.push('Wiring not included (varies by run distance)');
    }
    if (w !== widthFt || h !== heightFt) {
        assumptions.push('Dimensions rounded up to ' + w + '\' W \u00d7 ' + h + '\' H');
    }

    return {
        productType: 'Rolling Screen',
        productPrice,
        installPrice,
        total: productPrice + installPrice,
        assumptions,
    };
}

// ─── Shutter estimate ────────────────────────────────────────────────────────

function estimateShutter(widthFt, heightFt, operation, slatCategory) {
    const widthIn = Math.round(widthFt * 12);
    const heightIn = Math.round(heightFt * 12);

    // Auto-select slat type
    let slatType;
    if (slatCategory === 'foam') {
        if (operation === 'manual') {
            slatType = 'mini-foam-filled'; // Manual only available for mini
            if (widthIn > SHUTTER_SLAT_TYPES['mini-foam-filled'].maxWidth) {
                return { error: 'Manual foam-filled shutters max width is 12.5\'. For wider openings, choose Motorized.' };
            }
        } else {
            // Motorized: mini ≤12ft, standard >12ft
            slatType = widthIn <= 144 ? 'mini-foam-filled' : 'standard-foam-filled';
        }
    } else {
        slatType = 'single-wall';
    }

    // Check manual availability
    if (operation === 'manual') {
        if (slatType === 'standard-foam-filled') {
            return { error: 'Standard Foam-Filled (55mm) is only available motorized.' };
        }
        if (slatType === 'single-wall') {
            return { error: 'Extruded Aluminum (63mm) is not available with manual operation.' };
        }
    }

    // Operator category for table lookup
    const operatorCategory = operation === 'manual' ? 'manual' : 'electric';

    // Get pricing table
    const table = getShutterPricingTable(slatType, operatorCategory);
    if (!table) {
        return { error: 'No pricing table for this configuration.' };
    }

    // Round up to nearest available table key
    const widthKeys = Object.keys(table).map(Number).sort((a, b) => a - b);
    const wKey = widthKeys.find(function (k) { return k >= widthIn; });
    if (!wKey) {
        return { error: 'Width ' + widthFt + '\' (' + widthIn + '") exceeds maximum for ' + SHUTTER_SLAT_TYPES[slatType].label + '. Max: ' + widthKeys[widthKeys.length - 1] + '".' };
    }

    const heightKeys = Object.keys(table[String(wKey)]).map(Number).sort((a, b) => a - b);
    const hKey = heightKeys.find(function (k) { return k >= heightIn; });
    if (!hKey) {
        return { error: 'Height ' + heightFt + '\' (' + heightIn + '") exceeds maximum at ' + wKey + '" width. Max: ' + heightKeys[heightKeys.length - 1] + '".' };
    }

    var basePrice = table[String(wKey)][String(hKey)];
    if (basePrice === null || basePrice === undefined) {
        return { error: 'No pricing for this size combination.' };
    }

    // Motor surcharge (RTS upgrade from hardwired base) for motorized
    var motorSurcharge = 0;
    if (operation === 'motorized') {
        motorSurcharge = calculateMotorSurcharge(basePrice, 'rts');
    }

    var productPrice = Math.round(basePrice + motorSurcharge);

    // Installation
    var operator = operation === 'manual' ? 'pull-strap' : 'motor';
    var installPrice = getShutterInstallPrice(slatType, operator, widthIn);

    var slatLabel = SHUTTER_SLAT_TYPES[slatType].label;
    var assumptions = [
        slatLabel,
        operation === 'manual'
            ? 'Pull strap operation'
            : 'Electric with RTS wireless upgrade',
    ];
    if (slatCategory === 'foam' && operation === 'motorized' && widthIn > 144) {
        assumptions.push('Auto-selected Standard (55mm) for width > 12\'');
    }
    assumptions.push('Standard color (no surcharge)');
    assumptions.push('Solid slat (non-perforated)');
    assumptions.push('Includes installation labor');
    if (wKey !== widthIn || hKey !== heightIn) {
        assumptions.push('Lookup rounded to ' + wKey + '" W \u00d7 ' + hKey + '" H (from ' + widthIn + '" \u00d7 ' + heightIn + '")');
    }

    return {
        productType: 'Rolling Shutter',
        productPrice: productPrice,
        installPrice: installPrice,
        total: productPrice + installPrice,
        assumptions: assumptions,
    };
}

// ─── Display helpers ─────────────────────────────────────────────────────────

function formatEstimateCurrency(amount) {
    return '$' + amount.toLocaleString('en-US');
}

function showResult(result) {
    var html = ''
        + '<div class="result-card">'
        + '  <div class="result-header">' + result.productType + ' Estimate</div>'
        + '  <div class="result-line">'
        + '    <span>Product</span>'
        + '    <span class="result-price">' + formatEstimateCurrency(result.productPrice) + '</span>'
        + '  </div>'
        + '  <div class="result-line">'
        + '    <span>Installation</span>'
        + '    <span class="result-price">' + formatEstimateCurrency(result.installPrice) + '</span>'
        + '  </div>'
        + '  <div class="result-total">'
        + '    <span>Estimated Total</span>'
        + '    <span class="result-price">' + formatEstimateCurrency(result.total) + '</span>'
        + '  </div>'
        + '</div>'
        + '<div class="assumptions">'
        + '  <div class="assumptions-header">Assumptions</div>'
        + '  <ul>'
        + result.assumptions.map(function (a) { return '<li>' + a + '</li>'; }).join('')
        + '  </ul>'
        + '</div>'
        + '<div class="pricing-date">Pricing last updated: ' + LAST_PRICING_UPDATE + '</div>';

    var resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = html;
    resultsDiv.classList.remove('hidden');
}

function showError(message) {
    var resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="error-message">' + message + '</div>';
    resultsDiv.classList.remove('hidden');
}
