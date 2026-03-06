/**
 * pricing-engine.js
 * Pure pricing functions extracted from app.js for testability.
 *
 * Dependencies:
 *   - pricing-data.js must be loaded first (provides all pricing constants/tables)
 *
 * All functions in this file are pure — no DOM access, no side effects.
 * They depend only on their arguments and the globals from pricing-data.js.
 */

// ─── Utility Functions ──────────────────────────────────────────────────────

function parseFraction(fractionStr) {
    if (!fractionStr || fractionStr.trim() === '') return 0;

    const parts = fractionStr.trim().split('/');
    if (parts.length === 2) {
        const numerator = parseFloat(parts[0]);
        const denominator = parseFloat(parts[1]);
        if (denominator !== 0 && !isNaN(numerator) && !isNaN(denominator)) {
            return numerator / denominator;
        }
    }
    return 0;
}

function inchesToFeetAndInches(totalInches) {
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;

    // Round inches to nearest 1/8
    const roundedInches = Math.round(inches * 8) / 8;

    if (roundedInches === 12) {
        return `${feet + 1}' 0"`;
    }

    return `${feet}' ${roundedInches.toFixed(3).replace(/\.?0+$/, '')}"`;
}

function formatCurrency(amount) {
    return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Dropdown Option Helpers ────────────────────────────────────────────────

function getTrackTypeOptions() {
    return [
        { value: 'sunair-zipper', label: 'Sunair Zipper Track' },
        { value: 'sunair-cable', label: 'Sunair Cable' },
        { value: 'fenetex-keder', label: 'Fenetex Keder Track' }
    ];
}

function getTrackTypeName(value) {
    const opt = getTrackTypeOptions().find(o => o.value === value);
    return opt ? opt.label : '';
}

function getOperatorOptionsForTrack(trackType, isGuarantee) {
    if (!trackType) return [];
    const somfyOption = isGuarantee ? null : { value: 'somfy-rts', label: 'Somfy RTS Motor' };
    if (trackType === 'sunair-zipper' || trackType === 'sunair-cable') {
        const opts = [
            { value: 'gear', label: 'Gear Operation (Manual)' },
            { value: 'gaposa-rts', label: 'Gaposa RTS Motor' },
            { value: 'gaposa-solar', label: 'Gaposa Solar Motor' }
        ];
        if (somfyOption) opts.push(somfyOption);
        return opts;
    } else if (trackType === 'fenetex-keder') {
        return [{ value: 'gaposa-rts', label: 'Gaposa RTS Motor (Included)' }];
    }
    return [];
}

function getOperatorTypeName(trackType, operatorValue) {
    const opts = getOperatorOptionsForTrack(trackType, false);
    const opt = opts.find(o => o.value === operatorValue);
    return opt ? opt.label : '';
}

function getFabricOptions() {
    return [
        { value: 'T18FVT061-Espresso', label: 'Espresso Texture', group: 'Standard Fabrics' },
        { value: 'T18FVT054-Tobacco', label: 'Tobacco', group: 'Standard Fabrics' },
        { value: 'T18FVT061-Charcoal', label: 'Charcoal', group: 'Standard Fabrics' },
        { value: 'T18FVT059-Granite', label: 'Granite', group: 'Standard Fabrics' },
        { value: 'T18FVT060-Black', label: 'Black', group: 'Standard Fabrics' },
        { value: 'T18FVT056-Sable', label: 'Sable', group: 'Standard Fabrics' },
        { value: 'T18FVT-Black90', label: 'Black 90', group: '90% Fabrics' },
        { value: 'T18FVT-Brown90', label: 'Brown 90', group: '90% Fabrics' },
        { value: 'T18FVT-Black97', label: 'Black 97', group: '97% Fabrics' },
        { value: 'T18FVT-Charcoal97', label: 'Charcoal 97', group: '97% Fabrics' },
        { value: 'T18FVT-Tobacco97', label: 'Tobacco 97', group: '97% Fabrics' },
        { value: 'T18FVT-Tuffscreen', label: 'Tuffscreen / Bugscreen', group: 'Specialty' }
    ];
}

function getFabricName(value) {
    const opt = getFabricOptions().find(o => o.value === value);
    return opt ? opt.label : '';
}

function getFrameColorOptions() {
    return [
        { value: 'white', label: 'White' },
        { value: 'mocha', label: 'Mocha' },
        { value: 'taupe', label: 'Taupe' },
        { value: 'brown', label: 'Brown' },
        { value: 'bronze', label: 'Bronze' },
        { value: 'black', label: 'Black' },
        { value: 'grey', label: 'Grey' }
    ];
}

function getFrameColorName(value) {
    const opt = getFrameColorOptions().find(o => o.value === value);
    return opt ? opt.label : '';
}

function buildSelectOptionsHtml(options, selectedValue, placeholder) {
    let html = `<option value="">${placeholder || '-- Select --'}</option>`;
    options.forEach(opt => {
        const sel = opt.value === selectedValue ? ' selected' : '';
        html += `<option value="${escapeAttr(opt.value)}"${sel}>${escapeAttr(opt.label)}</option>`;
    });
    return html;
}

// ─── Client-Facing Display Names ────────────────────────────────────────────

function getClientFacingOperatorName(operatorType, operatorTypeName) {
    // Remove brand names from motor descriptions for client-facing display
    if (operatorType === 'gear') {
        return 'Manual Gear Operation';
    }
    if (operatorType === 'gaposa-rts') {
        return 'Remote-Operated Motor';
    }
    if (operatorType === 'gaposa-solar') {
        return 'Solar Motor';
    }
    if (operatorType === 'somfy-rts') {
        return 'Remote-Operated Motor';
    }
    return operatorTypeName;
}

function getClientFacingTrackName(trackTypeName) {
    // Remove brand names from track descriptions
    return trackTypeName.replace('Sunair ', '').replace('Fenetex ', '');
}

// ─── Core Pricing Engine ────────────────────────────────────────────────────

function getDimensionError(priceData, trackType, width, height) {
    const trackLabel = trackType === 'sunair-zipper' ? 'Zipper Track'
        : trackType === 'sunair-cable' ? 'Cable Track'
        : trackType === 'fenetex-keder' ? 'Keder Track'
        : 'this track type';

    if (!priceData) {
        return `No pricing table for ${trackLabel}`;
    }

    const widths = Object.keys(priceData).map(Number).sort((a, b) => a - b);
    const minW = widths[0];
    const maxW = widths[widths.length - 1];

    if (width < minW || width > maxW) {
        return `${width}' width is outside the ${trackLabel} range (${minW}'–${maxW}' W). Please adjust the width.`;
    }

    // Width is valid — check height
    const heightMap = priceData[String(width)];
    if (!heightMap) {
        return `No pricing for ${width}' W x ${height}' H with ${trackLabel}`;
    }

    const heights = Object.keys(heightMap).filter(h => heightMap[h] !== null && heightMap[h] !== undefined).map(Number).sort((a, b) => a - b);
    const minH = heights[0];
    const maxH = heights[heights.length - 1];

    if (height < minH) {
        return `${height}' height is below the minimum for ${trackLabel} (min ${minH}' H). Please increase the height.`;
    }
    if (height > maxH) {
        return `${height}' height exceeds the maximum for ${width}' wide ${trackLabel} screens (max ${maxH}' H). Please reduce the height or width.`;
    }

    return `No pricing available for ${width}' W x ${height}' H with ${trackLabel}`;
}

function computeScreenPricing(p) {
    const { trackType, operatorType, width, height, noTracks, includeInstallation,
            wiringDistance: wiringDistInput, accessories, guaranteeActive } = p;

    let baseCost = 0;
    let screenCostOnly = 0;
    let priceData = null;
    let motorCost = 0;
    let isFenetex = false;

    if (trackType === 'sunair-zipper') {
        priceData = sunairZipperGear;
    } else if (trackType === 'sunair-cable') {
        priceData = sunairCableGear;
    } else if (trackType === 'fenetex-keder') {
        priceData = fenetexKeder;
        isFenetex = true;
    }

    // Get screen cost from pricing matrix
    if (priceData && priceData[width] && priceData[width][height] !== null && priceData[width][height] !== undefined) {
        let screenCost = priceData[width][height];
        if (!isFenetex) {
            screenCost = screenCost * getFabricPriceMultiplier(p.fabricColor);
            screenCost = screenCost * (1 - SUNAIR_DISCOUNT);
        }
        screenCostOnly = screenCost;
        baseCost += screenCost;
    } else {
        return { error: getDimensionError(priceData, trackType, width, height) };
    }

    // Add motor cost
    if (operatorType === 'gaposa-rts') {
        motorCost = motorCosts['gaposa-rts'];
    } else if (operatorType === 'gaposa-solar') {
        motorCost = motorCosts['gaposa-solar'];
    } else if (operatorType === 'somfy-rts') {
        motorCost = motorCosts['somfy-rts'];
    }
    if (!isFenetex && motorCost > 0) {
        baseCost += motorCost;
    }

    // Track deduction
    let trackDeduction = 0;
    if (noTracks && trackDeductions[height]) {
        trackDeduction = trackDeductions[height] * (1 - SUNAIR_DISCOUNT);
        baseCost += trackDeduction;
    }

    // Accessories cost
    let accessoriesCost = 0;
    (accessories || []).forEach(acc => {
        accessoriesCost += acc.cost;
    });

    let totalCost = baseCost + accessoriesCost;

    // Customer price with markup
    let customerPrice = 0;
    if (isFenetex) {
        const sunairScreenCost = sunairZipperGear[width] && sunairZipperGear[width][height]
            ? sunairZipperGear[width][height] * (1 - SUNAIR_DISCOUNT) : 0;
        const sunairRTSMotor = motorCosts['gaposa-rts'];
        customerPrice = (sunairScreenCost + sunairRTSMotor) * CUSTOMER_MARKUP * FENETEX_MARKUP;
        (accessories || []).forEach(acc => {
            customerPrice += acc.needsMarkup ? acc.cost * CUSTOMER_MARKUP : acc.cost;
        });
    } else {
        let screenOnlyCost = baseCost - motorCost;
        if (noTracks) screenOnlyCost -= trackDeduction;
        customerPrice = screenOnlyCost * CUSTOMER_MARKUP;
        const effectiveMotorCost = (guaranteeActive && operatorType === 'gaposa-solar')
            ? motorCosts['gaposa-rts'] : motorCost;
        customerPrice += effectiveMotorCost * CUSTOMER_MARKUP;
        if (noTracks) customerPrice += trackDeduction;
        (accessories || []).forEach(acc => {
            customerPrice += acc.needsMarkup ? acc.cost * CUSTOMER_MARKUP : acc.cost;
        });
    }

    // Installation
    let installationCost = 0;
    let installationPrice = 0;
    if (includeInstallation) {
        const isLarge = width >= 12;
        const isSolar = operatorType === 'gaposa-solar';
        if (isLarge) {
            installationPrice = isSolar ? installationPricing['solar-large'] : installationPricing['rts-large'];
        } else {
            installationPrice = isSolar ? installationPricing['solar-small'] : installationPricing['rts-small'];
        }
        installationCost = installationPrice * 0.7;
        customerPrice += installationPrice;
    }

    // Wiring (RTS motors with installation only)
    // Base charge: $100 flat ($30 material + $70 labor) + $12/ft
    let wiringDistance = 0;
    let wiringCost = 0;
    let wiringPrice = 0;
    const isRts = operatorType === 'gaposa-rts' || operatorType === 'somfy-rts';
    if (includeInstallation && isRts) {
        wiringDistance = parseInt(wiringDistInput) || 0;
        if (wiringDistance > 0) {
            wiringCost = WIRING_BASE_COST_MATERIAL + WIRING_BASE_COST_LABOR + wiringDistance * WIRING_COST_PER_FOOT;
            wiringPrice = WIRING_BASE_PRICE + wiringDistance * WIRING_PRICE_PER_FOOT;
            customerPrice += wiringPrice;
        }
    }

    return {
        phase: 'configured',
        screenName: p.screenName || null,
        trackType: p.trackType,
        trackTypeName: p.trackTypeName,
        operatorType: p.operatorType,
        operatorTypeName: p.operatorTypeName,
        fabricColor: p.fabricColor,
        fabricColorName: p.fabricColorName,
        frameColor: p.frameColor || '',
        frameColorName: p.frameColorName || '',
        width, height,
        totalWidthInches: p.totalWidthInches,
        totalHeightInches: p.totalHeightInches,
        actualWidthDisplay: p.actualWidthDisplay,
        actualHeightDisplay: p.actualHeightDisplay,
        noTracks: p.noTracks || false,
        includeInstallation: p.includeInstallation || false,
        screenCostOnly, motorCost, baseCost,
        accessories: accessories || [],
        accessoriesCost, totalCost,
        installationCost, installationPrice,
        wiringDistance, wiringCost, wiringPrice,
        customerPrice, isFenetex, trackDeduction,
        guaranteeDiscount: (guaranteeActive && operatorType === 'gaposa-solar')
            ? (motorCosts['gaposa-solar'] - motorCosts['gaposa-rts']) * CUSTOMER_MARKUP : 0,
        guaranteeBondBridge: guaranteeActive && isRts,
        photos: p.photos || [],
        pendingPhotos: p.pendingPhotos || [],
        // Preserve raw input values for re-editing
        widthInputValue: p.widthInputValue,
        widthFractionValue: p.widthFractionValue,
        heightInputValue: p.heightInputValue,
        heightFractionValue: p.heightFractionValue
    };
}

// ─── Comparison Pricing ─────────────────────────────────────────────────────

function calculateScreenWithAlternateMotor(screen, alternateMotorType, guaranteeActive) {
    // Calculate what the screen would cost with a different motor/operator
    let alternateMotorCost = 0;

    if (alternateMotorType === 'gaposa-rts') {
        alternateMotorCost = motorCosts['gaposa-rts'];
    } else if (alternateMotorType === 'gaposa-solar') {
        alternateMotorCost = motorCosts['gaposa-solar'];
    } else if (alternateMotorType === 'somfy-rts') {
        alternateMotorCost = motorCosts['somfy-rts'];
    }
    // gear: alternateMotorCost stays 0

    // Start with screen-only cost (no motor)
    let screenOnlyCost = screen.screenCostOnly;

    // Add track deduction if applicable
    if (screen.trackDeduction) {
        screenOnlyCost += screen.trackDeduction;
    }

    // Calculate customer price with alternate motor (guarantee: solar at RTS rate)
    const effectiveAltMotorCost = (guaranteeActive && alternateMotorType === 'gaposa-solar')
        ? motorCosts['gaposa-rts'] : alternateMotorCost;
    let customerPrice = screenOnlyCost * CUSTOMER_MARKUP;
    customerPrice += effectiveAltMotorCost * CUSTOMER_MARKUP;

    // Add back track deduction after markup
    if (screen.trackDeduction) {
        customerPrice += screen.trackDeduction;
    }

    // For gear comparison, skip motor-specific accessories (remotes, keypads, etc.)
    // For motor comparisons, include accessories as-is
    if (alternateMotorType !== 'gear') {
        screen.accessories.forEach(acc => {
            if (acc.needsMarkup) {
                customerPrice += acc.cost * CUSTOMER_MARKUP;
            } else {
                customerPrice += acc.cost;
            }
        });
    }

    // Add installation (same for all motor types with same size/type)
    customerPrice += screen.installationPrice;

    return {
        customerPrice: customerPrice,
        motorCost: alternateMotorCost,
        materialPrice: customerPrice - screen.installationPrice
    };
}

function calculateScreenWithAlternateTrack(screen, altTrackType, guaranteeActive) {
    // Calculate what the screen would cost with a different track type
    const priceData = getPricingTable(altTrackType);
    if (!priceData) return null;

    const widthKey = String(screen.width);
    const heightKey = String(screen.height);

    if (!priceData[widthKey] || !priceData[widthKey][heightKey]) return null; // Incompatible dimensions

    // Determine operator — Fenetex only supports gaposa-rts
    let altOperator = screen.operatorType;
    if (altTrackType === 'fenetex-keder') {
        altOperator = 'gaposa-rts';
    }

    const result = computeScreenPricing({
        screenName: screen.screenName,
        trackType: altTrackType,
        trackTypeName: getTrackTypeName(altTrackType),
        operatorType: altOperator,
        operatorTypeName: getOperatorTypeName(altTrackType, altOperator),
        fabricColor: screen.fabricColor,
        fabricColorName: screen.fabricColorName,
        frameColor: screen.frameColor,
        frameColorName: screen.frameColorName,
        width: screen.width,
        height: screen.height,
        totalWidthInches: screen.totalWidthInches,
        totalHeightInches: screen.totalHeightInches,
        actualWidthDisplay: screen.actualWidthDisplay,
        actualHeightDisplay: screen.actualHeightDisplay,
        noTracks: false, // No tracks only applies to zipper
        includeInstallation: screen.includeInstallation,
        wiringDistance: screen.wiringDistance,
        accessories: [], // Different track may have different accessories — use none for comparison
        guaranteeActive,
        photos: screen.photos || [],
        pendingPhotos: screen.pendingPhotos || [],
        widthInputValue: screen.widthInputValue,
        widthFractionValue: screen.widthFractionValue,
        heightInputValue: screen.heightInputValue,
        heightFractionValue: screen.heightFractionValue
    });

    if (!result) return null;

    return {
        customerPrice: result.customerPrice,
        materialPrice: result.customerPrice - result.installationPrice - (result.wiringPrice || 0)
    };
}

// ─── Conditional exports for Node.js testing ────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        parseFraction, inchesToFeetAndInches, formatCurrency,
        getTrackTypeOptions, getTrackTypeName,
        getOperatorOptionsForTrack, getOperatorTypeName,
        getFabricOptions, getFabricName,
        getFrameColorOptions, getFrameColorName,
        escapeAttr, buildSelectOptionsHtml,
        getClientFacingOperatorName, getClientFacingTrackName,
        computeScreenPricing,
        calculateScreenWithAlternateMotor,
        calculateScreenWithAlternateTrack
    };
}
