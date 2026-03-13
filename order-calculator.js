/**
 * order-calculator.js
 * Legacy + multi-screen order calculation and display.
 *
 * Dependencies:
 *   - pricing-engine.js (provides computeScreenPricing, formatCurrency,
 *     getTrackTypeName, getOperatorTypeName, getFabricName, getFrameColorName,
 *     getClientFacingOperatorName, getClientFacingTrackName,
 *     calculateScreenWithAlternateMotor, calculateScreenWithAlternateTrack,
 *     inchesToFeetAndInches, getOperatorOptionsForTrack)
 *   - pricing-data.js (provides SUNAIR_DISCOUNT, CUSTOMER_MARKUP, motorCosts,
 *     installationPricing, accessories, getPricingTable, CABLE_SURCHARGE,
 *     WIRING_COST_PER_FOOT, WIRING_PRICE_PER_FOOT, ONE_PER_ORDER_ACCESSORY_NAMES)
 *   - quote-persistence.js (provides autoSaveQuote, refreshEmailHistory)
 *   - screen-cards.js (provides getApplicableProjectAccessories, renderScreensList,
 *     updateAddToOrderButton)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - screensInOrder: Array of screen objects
 *   - currentQuoteId: Active quote's DB ID
 *   - WORKER_URL: Worker base URL (from index.html)
 *   - window.currentOrderData: Calculated order data (written here)
 *   - projectAccessories: Array of project-level accessories
 *
 * Extracted from app.js in Step 2 refactoring.
 */
function calculateQuote() {
    // Get form values
    const customerName = document.getElementById('customerName').value;
    const trackType = document.getElementById('trackType').value;
    const operatorType = document.getElementById('operatorType').value;
    const noTracks = document.getElementById('noTracks').checked;
    const includeInstallation = document.getElementById('includeInstallation').checked;

    // Get dimensions
    const widthInches = parseFloat(document.getElementById('widthInches').value) || 0;
    const widthFraction = parseFraction(document.getElementById('widthFraction').value);
    const heightInches = parseFloat(document.getElementById('heightInches').value) || 0;
    const heightFraction = parseFraction(document.getElementById('heightFraction').value);

    // Calculate total inches and round to nearest foot for pricing
    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;
    const width = Math.round(totalWidthInches / 12);
    const height = Math.round(totalHeightInches / 12);

    // Store actual dimensions for display
    const actualWidthDisplay = inchesToFeetAndInches(totalWidthInches);
    const actualHeightDisplay = inchesToFeetAndInches(totalHeightInches);

    // Validation
    if (!customerName || !trackType || !operatorType) {
        alert('Please fill in all required fields (marked with *)');
        return;
    }

    if (totalWidthInches === 0 || totalHeightInches === 0) {
        alert('Please enter valid screen dimensions');
        return;
    }

    // Build screen type identifier
    const screenType = `${trackType}-${operatorType}`;

    // Calculate base screen cost
    let baseCost = 0;
    let screenCostOnly = 0;
    let priceData = null;
    let motorCost = 0;
    let isFenetex = false;

    if (trackType === 'sunair-zipper') {
        priceData = sunairZipperGear;
    } else if (trackType === 'sunair-cable') {
        priceData = sunairCableGear;
        baseCost += CABLE_SURCHARGE; // Add cable surcharge
    } else if (trackType === 'fenetex-keder') {
        priceData = fenetexKeder;
        isFenetex = true;
    }

    // Get screen cost from pricing matrix
    if (priceData && priceData[width] && priceData[width][height] !== null && priceData[width][height] !== undefined) {
        let screenCost = priceData[width][height];

        // Apply Sunair discount for non-Fenetex screens
        if (!isFenetex) {
            screenCost = screenCost * (1 - SUNAIR_DISCOUNT);
        }

        screenCostOnly = screenCost;
        baseCost += screenCost;
    } else {
        alert(`Invalid screen dimensions. No pricing available for ${width}' W x ${height}' H. Please check the size and try again.`);
        return;
    }

    // Add motor cost for motorized options
    if (operatorType === 'gaposa-rts') {
        motorCost = motorCosts['gaposa-rts'];
    } else if (operatorType === 'gaposa-solar') {
        motorCost = motorCosts['gaposa-solar'];
    } else if (operatorType === 'somfy-rts') {
        motorCost = motorCosts['somfy-rts'];
    }

    // For Fenetex, RTS motor is already included in pricing
    if (!isFenetex && motorCost > 0) {
        baseCost += motorCost;
    }

    // Apply track deduction if selected
    let trackDeduction = 0;
    if (noTracks && trackDeductions[height]) {
        trackDeduction = trackDeductions[height] * (1 - SUNAIR_DISCOUNT);
        baseCost += trackDeduction;
    }

    // Calculate accessories cost
    let accessoriesCost = 0;
    const checkboxes = document.querySelectorAll('.accessory-item input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        let accCost = parseFloat(cb.dataset.cost);
        const needsDiscount = cb.dataset.markup === 'true';
        if (needsDiscount) {
            accCost = accCost * (1 - SUNAIR_DISCOUNT);
        }
        accessoriesCost += accCost;
    });

    let totalCost = baseCost + accessoriesCost;

    // Apply markup to get customer price
    let customerPrice = 0;
    if (isFenetex) {
        // For Fenetex, use Sunair Zipper RTS price for that size + 20%
        const sunairScreenCost = sunairZipperGear[width] && sunairZipperGear[width][height]
            ? sunairZipperGear[width][height] * (1 - SUNAIR_DISCOUNT)
            : 0;
        const sunairRTSMotor = motorCosts['gaposa-rts'];

        // Apply markup: (screen * 1.8 + motor * 1.8) * 1.2
        customerPrice = (sunairScreenCost + sunairRTSMotor) * CUSTOMER_MARKUP * FENETEX_MARKUP;

        // Add accessories with their proper markup
        checkboxes.forEach(cb => {
            let accCost = parseFloat(cb.dataset.cost);
            const needsMarkup = cb.dataset.markup === 'true';
            if (needsMarkup) {
                accCost = accCost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
            }
            customerPrice += accCost;
        });
    } else {
        // Standard Sunair pricing - separate screen and motor markup
        // Screen cost (with any cable surcharge) gets discounted and marked up
        let screenOnlyCost = baseCost - motorCost;

        // Handle track deduction
        if (noTracks) {
            screenOnlyCost -= trackDeduction; // Remove track deduction from markup base
        }

        // Apply 1.8x markup to screen
        customerPrice = screenOnlyCost * CUSTOMER_MARKUP;

        // Add motor with 1.8x markup (motor cost is already special price, no discount)
        customerPrice += motorCost * CUSTOMER_MARKUP;

        // Add back track deduction (negative value) after markup
        if (noTracks) {
            customerPrice += trackDeduction;
        }

        // Add accessories with their proper markup
        checkboxes.forEach(cb => {
            let accCost = parseFloat(cb.dataset.cost);
            const needsMarkup = cb.dataset.markup === 'true';
            if (needsMarkup) {
                accCost = accCost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
            }
            customerPrice += accCost;
        });
    }

    // Calculate installation
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

        installationCost = installationPrice * 0.7; // Cost to company (70% to installer)
        customerPrice += installationPrice;
    }

    // Calculate wiring (RTS motors with installation only)
    // Base charge: $100 flat ($30 material + $70 labor) + $12/ft
    let wiringDistance = 0;
    let wiringCost = 0;
    let wiringPrice = 0;
    const isRts = operatorType === 'gaposa-rts' || operatorType === 'somfy-rts';
    if (includeInstallation && isRts) {
        wiringDistance = parseInt(document.getElementById('wiringDistance').value) || 0;
        if (wiringDistance > 0) {
            wiringCost = WIRING_BASE_COST_MATERIAL + WIRING_BASE_COST_LABOR + wiringDistance * WIRING_COST_PER_FOOT;
            wiringPrice = WIRING_BASE_PRICE + wiringDistance * WIRING_PRICE_PER_FOOT;
            customerPrice += wiringPrice;
        }
    }

    const totalProfit = customerPrice - totalCost - installationCost - wiringCost;
    const marginPercent = (totalProfit / customerPrice) * 100;

    // Display quote summary
    displayQuoteSummary({
        customerName,
        trackType,
        operatorType,
        screenType,
        width,
        height,
        actualWidthDisplay,
        actualHeightDisplay,
        noTracks,
        includeInstallation,
        screenCostOnly,
        motorCost,
        baseCost,
        accessoriesCost,
        totalCost,
        installationCost,
        installationPrice,
        wiringDistance,
        wiringCost,
        wiringPrice,
        customerPrice,
        totalProfit,
        marginPercent,
        isFenetex
    });
}

function displayQuoteSummary(quote) {
    const summaryContent = document.getElementById('summaryContent');
    const internalInfo = document.getElementById('internalInfo');
    const quoteSummary = document.getElementById('quoteSummary');

    const trackTypeName = document.getElementById('trackType').selectedOptions[0].text;
    const operatorTypeName = document.getElementById('operatorType').selectedOptions[0].text;
    const fabricColor = document.getElementById('fabricColor').selectedOptions[0].text;

    // Build address display
    let addressParts = [];
    if (quote.streetAddress) addressParts.push(quote.streetAddress);
    if (quote.aptSuite) addressParts.push(quote.aptSuite);
    const addressLine1 = addressParts.join(', ');

    let cityStateZip = [];
    if (quote.city) cityStateZip.push(quote.city);
    if (quote.state) cityStateZip.push(quote.state);
    const addressLine2 = cityStateZip.join(', ');
    if (quote.zipCode) addressLine2 ? addressLine2 += ' ' + quote.zipCode : quote.zipCode;

    const fullAddress = [addressLine1, addressLine2].filter(x => x).join('<br>');

    // Customer-facing summary
    let customerHTML = `
        <div class="summary-row">
            <strong>Customer:</strong>
            <span>${quote.customerName}${quote.companyName ? ' (' + quote.companyName + ')' : ''}</span>
        </div>
        ${fullAddress ? `<div class="summary-row">
            <strong>Project Address:</strong>
            <span>${fullAddress}</span>
        </div>` : ''}
        ${quote.nearestIntersection ? `<div class="summary-row">
            <strong>Nearest Intersection:</strong>
            <span>${quote.nearestIntersection}</span>
        </div>` : ''}
        <div class="summary-row">
            <strong>Track System:</strong>
            <span>${trackTypeName}</span>
        </div>
        <div class="summary-row">
            <strong>Operator:</strong>
            <span>${operatorTypeName}</span>
        </div>
        <div class="summary-row">
            <strong>Fabric Color:</strong>
            <span>${fabricColor}</span>
        </div>
        <div class="summary-row">
            <strong>Frame Color:</strong>
            <span>${quote.frameColorName || 'Not specified'}</span>
        </div>
        <div class="summary-row">
            <strong>Dimensions:</strong>
            <span>${quote.actualWidthDisplay} W x ${quote.actualHeightDisplay} H</span>
        </div>
    `;

    if (quote.noTracks) {
        customerHTML += `
            <div class="summary-row">
                <strong>Configuration:</strong>
                <span>No Tracks</span>
            </div>
        `;
    }

    const selectedAccessories = Array.from(document.querySelectorAll('.accessory-item input[type="checkbox"]:checked'))
        .map(cb => cb.nextElementSibling.textContent);

    if (selectedAccessories.length > 0) {
        customerHTML += `
            <div class="summary-row">
                <strong>Accessories:</strong>
                <span>${selectedAccessories.join(', ')}</span>
            </div>
        `;
    }

    if (quote.includeInstallation) {
        customerHTML += `
            <div class="summary-row">
                <strong>Installation:</strong>
                <span>$${quote.installationPrice.toFixed(2)}</span>
            </div>
        `;
    }

    if (quote.wiringDistance > 0) {
        customerHTML += `
            <div class="summary-row">
                <strong>Wiring (setup + ${quote.wiringDistance} ft):</strong>
                <span>$${quote.wiringPrice.toFixed(2)}</span>
            </div>
        `;
    }

    customerHTML += `
        <div class="summary-row total">
            <strong>Total Price:</strong>
            <span>$${quote.customerPrice.toFixed(2)}</span>
        </div>
    `;

    summaryContent.innerHTML = customerHTML;

    // Internal information with separated costs
    let internalHTML = `
        <div class="summary-row">
            <strong>Pricing Dimensions:</strong>
            <span>${quote.width}' W x ${quote.height}' H (rounded from actual)</span>
        </div>
        <div class="summary-row">
            <strong>Screen Cost (base):</strong>
            <span>$${quote.screenCostOnly.toFixed(2)}</span>
        </div>
    `;

    if (quote.motorCost > 0 && !quote.isFenetex) {
        internalHTML += `
            <div class="summary-row">
                <strong>Motor Cost:</strong>
                <span>$${quote.motorCost.toFixed(2)}</span>
            </div>
        `;
    }

    if (quote.isFenetex) {
        internalHTML += `
            <div class="summary-row">
                <strong>Motor Cost:</strong>
                <span>Included in screen price</span>
            </div>
        `;
    }

    internalHTML += `
        <div class="summary-row">
            <strong>Total Screen + Motor:</strong>
            <span>$${quote.baseCost.toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <strong>Accessories Cost:</strong>
            <span>$${quote.accessoriesCost.toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <strong>Installation Cost:</strong>
            <span>$${quote.installationCost.toFixed(2)}</span>
        </div>
        ${quote.wiringDistance > 0 ? `<div class="summary-row">
            <strong>Wiring Cost (setup + ${quote.wiringDistance} ft):</strong>
            <span>$${quote.wiringCost.toFixed(2)}</span>
        </div>` : ''}
        <div class="summary-row">
            <strong>Total Cost:</strong>
            <span>$${(quote.totalCost + quote.installationCost + quote.wiringCost).toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <strong>Profit:</strong>
            <span>$${quote.totalProfit.toFixed(2)}</span>
        </div>
        <div class="summary-row">
            <strong>Margin:</strong>
            <span>${quote.marginPercent.toFixed(1)}%</span>
        </div>
    `;

    internalInfo.innerHTML = internalHTML;
    quoteSummary.classList.remove('hidden');

    // Scroll to summary
    quoteSummary.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function calculateOrderQuote() {
    const includedScreens = screensInOrder.filter(s => !s.excluded);
    if (includedScreens.length === 0) {
        alert('Please add at least one screen to the order (all screens are excluded)');
        return;
    }

    // Block if any non-excluded screens are unconfigured
    const unconfigured = screensInOrder.filter(s => s.phase === 'opening' && !s.excluded);
    if (unconfigured.length > 0) {
        const names = unconfigured.map((s, i) => s.screenName || `Opening ${screensInOrder.indexOf(s) + 1}`);
        alert(`Cannot calculate quote — ${unconfigured.length} opening${unconfigured.length !== 1 ? 's need' : ' needs'} configuration:\n\n• ${names.join('\n• ')}\n\nUse "Configure Screens" (Step 2) to set track, motor, and fabric for these openings.`);
        return;
    }

    // Get customer info
    const customerName = document.getElementById('customerName').value;
    if (!customerName) {
        alert('Please enter customer name');
        return;
    }

    // Calculate totals
    let orderTotalCost = 0;
    let orderTotalMaterialsPrice = 0;
    let orderTotalInstallationCost = 0;
    let orderTotalInstallationPrice = 0;
    let orderTotalWiringCost = 0;
    let orderTotalWiringPrice = 0;
    let hasCableScreen = false;

    // Internal cost breakdowns
    let totalScreenCosts = 0;
    let totalMotorCosts = 0;
    let totalAccessoriesCosts = 0;
    let totalCableSurcharge = 0;
    let totalGuaranteeDiscount = 0;
    const fourWeekGuarantee = document.getElementById('fourWeekGuarantee').checked;

    // Re-price each configured screen with the current guarantee state
    // so toggling the guarantee always recalculates correctly
    screensInOrder.forEach((screen, index) => {
        if (screen.excluded || screen.phase === 'opening') return;
        const repriced = computeScreenPricing({
            screenName: screen.screenName,
            trackType: screen.trackType,
            trackTypeName: screen.trackTypeName,
            operatorType: screen.operatorType,
            operatorTypeName: screen.operatorTypeName,
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
            noTracks: screen.noTracks,
            includeInstallation: screen.includeInstallation,
            wiringDistance: screen.wiringDistance,
            accessories: screen.accessories,
            guaranteeActive: fourWeekGuarantee,
            photos: screen.photos || [],
            pendingPhotos: screen.pendingPhotos || [],
            widthInputValue: screen.widthInputValue,
            widthFractionValue: screen.widthFractionValue,
            heightInputValue: screen.heightInputValue,
            heightFractionValue: screen.heightFractionValue
        });
        if (!repriced.error) {
            // Preserve entity IDs and excluded state
            repriced._openingId = screen._openingId;
            repriced._lineItemId = screen._lineItemId;
            repriced.excluded = screen.excluded;
            screensInOrder[index] = repriced;
        }
    });

    screensInOrder.forEach((screen, index) => {
        if (screen.excluded) return; // Skip excluded screens

        // Materials price (excluding installation and wiring)
        let screenMaterialsPrice = screen.customerPrice - screen.installationPrice - (screen.wiringPrice || 0);

        // Check if this is a cable screen and apply surcharge only to first
        let screenCost = screen.totalCost;

        if (screen.trackType === 'sunair-cable') {
            if (!hasCableScreen) {
                // First cable screen - add surcharge
                screenCost += CABLE_SURCHARGE;
                screenMaterialsPrice += CABLE_SURCHARGE * CUSTOMER_MARKUP;
                totalCableSurcharge += CABLE_SURCHARGE;
                hasCableScreen = true;
            }
        }

        orderTotalCost += screenCost;
        orderTotalMaterialsPrice += screenMaterialsPrice;
        orderTotalInstallationCost += screen.installationCost;
        orderTotalInstallationPrice += screen.installationPrice;
        orderTotalWiringCost += (screen.wiringCost || 0);
        orderTotalWiringPrice += (screen.wiringPrice || 0);

        // Track internal cost breakdowns
        totalScreenCosts += screen.screenCostOnly;
        totalMotorCosts += screen.motorCost;
        totalAccessoriesCosts += screen.accessoriesCost;
        totalGuaranteeDiscount += (screen.guaranteeDiscount || 0);
    });

    // Bond Bridge: if guarantee active and any non-excluded RTS screen, add one Bond Bridge ($360)
    let guaranteeBondBridge = false;
    if (fourWeekGuarantee) {
        guaranteeBondBridge = screensInOrder.some(s => !s.excluded && s.guaranteeBondBridge);
        if (guaranteeBondBridge) {
            totalGuaranteeDiscount += 360; // One Bond Bridge per project
        }
    }

    // Deduplicate one-per-order accessories (e.g., 5-ch/16-ch remotes, Bond Bridge)
    // Each screen's customerPrice already includes its accessories; subtract duplicates.
    let sharedAccessoriesDeduction = 0;
    let sharedAccessoriesCostDeduction = 0;
    const seenOnePerOrder = {};
    screensInOrder.forEach(screen => {
        if (screen.excluded) return;
        (screen.accessories || []).forEach(acc => {
            if (ONE_PER_ORDER_ACCESSORY_NAMES.has(acc.name)) {
                if (seenOnePerOrder[acc.name]) {
                    // Duplicate — deduct customer price and raw cost
                    const customerPriceForAcc = acc.needsMarkup ? acc.cost * CUSTOMER_MARKUP : acc.cost;
                    sharedAccessoriesDeduction += customerPriceForAcc;
                    sharedAccessoriesCostDeduction += acc.cost;
                } else {
                    seenOnePerOrder[acc.name] = true;
                }
            }
        });
    });
    if (sharedAccessoriesDeduction > 0) {
        orderTotalMaterialsPrice -= sharedAccessoriesDeduction;
        orderTotalCost -= sharedAccessoriesCostDeduction;
        totalAccessoriesCosts -= sharedAccessoriesCostDeduction;
    }

    // Add project-level accessories to materials (so discount applies)
    let projectAccessoriesTotalCost = 0;
    let projectAccessoriesTotalPrice = 0;
    projectAccessories.forEach(acc => {
        projectAccessoriesTotalCost += acc.cost * acc.quantity;
        projectAccessoriesTotalPrice += acc.customerPrice * acc.quantity;
    });
    orderTotalMaterialsPrice += projectAccessoriesTotalPrice;
    orderTotalCost += projectAccessoriesTotalCost;
    totalAccessoriesCosts += projectAccessoriesTotalCost;

    // Get extra misc install cost
    const miscInstallLabel = document.getElementById('miscInstallLabel').value.trim() || 'Additional Installation';
    const miscInstallAmount = parseFloat(document.getElementById('miscInstallAmount').value) || 0;
    const miscInstallCost = miscInstallAmount * 0.70;  // 70% to installer

    // Get discount information
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const discountLabel = document.getElementById('discountLabel').value.trim() || 'Discount';
    const discountAmount = (orderTotalMaterialsPrice * discountPercent) / 100;
    const discountedMaterialsPrice = orderTotalMaterialsPrice - discountAmount;

    // Add misc install to totals (separate line item, not subject to discount)
    const orderTotalPrice = discountedMaterialsPrice + orderTotalInstallationPrice + orderTotalWiringPrice + miscInstallAmount;
    orderTotalInstallationCost += miscInstallCost;  // Fold 70% into installer cost
    const totalProfit = orderTotalPrice - orderTotalCost - orderTotalInstallationCost - orderTotalWiringPrice;
    const marginPercent = orderTotalPrice > 0 ? (totalProfit / orderTotalPrice) * 100 : 0;

    // Get comparison information
    const enableComparison = document.getElementById('enableComparison').checked;
    const comparisonType = document.querySelector('input[name="comparisonType"]:checked')?.value || 'motor';
    const comparisonMotor = document.getElementById('comparisonMotor').value;
    const comparisonTrack = document.getElementById('comparisonTrack').value;

    // Calculate comparison totals if enabled
    let comparisonTotalMaterialsPrice = 0;
    let comparisonTotalPrice = 0;
    let comparisonDiscountedMaterialsPrice = 0;
    const comparisonScreens = [];
    let comparisonSkippedCount = 0;

    const comparisonActive = enableComparison && (
        (comparisonType === 'motor' && comparisonMotor) ||
        (comparisonType === 'track' && comparisonTrack)
    );

    if (comparisonActive) {
        const guaranteeActive = document.getElementById('fourWeekGuarantee').checked;
        screensInOrder.forEach(screen => {
            if (screen.excluded) {
                comparisonScreens.push({ ...screen });
                return;
            }

            if (comparisonType === 'motor') {
                // Motor comparison (existing logic)
                if (screen.operatorType !== comparisonMotor) {
                    const comparisonData = calculateScreenWithAlternateMotor(screen, comparisonMotor, guaranteeActive);
                    comparisonScreens.push({
                        ...screen,
                        comparisonPrice: comparisonData.customerPrice,
                        comparisonMaterialPrice: comparisonData.materialPrice
                    });
                    comparisonTotalMaterialsPrice += comparisonData.materialPrice;
                } else {
                    comparisonScreens.push({
                        ...screen,
                        comparisonPrice: screen.customerPrice,
                        comparisonMaterialPrice: screen.customerPrice - screen.installationPrice
                    });
                    comparisonTotalMaterialsPrice += (screen.customerPrice - screen.installationPrice);
                }
            } else {
                // Track comparison
                if (screen.trackType !== comparisonTrack) {
                    const comparisonData = calculateScreenWithAlternateTrack(screen, comparisonTrack, guaranteeActive);
                    if (comparisonData) {
                        comparisonScreens.push({
                            ...screen,
                            comparisonPrice: comparisonData.customerPrice,
                            comparisonMaterialPrice: comparisonData.materialPrice
                        });
                        comparisonTotalMaterialsPrice += comparisonData.materialPrice;
                    } else {
                        // Dimensions incompatible with this track type
                        comparisonScreens.push({
                            ...screen,
                            comparisonPrice: null,
                            comparisonMaterialPrice: null
                        });
                        comparisonSkippedCount++;
                    }
                } else {
                    comparisonScreens.push({
                        ...screen,
                        comparisonPrice: screen.customerPrice,
                        comparisonMaterialPrice: screen.customerPrice - screen.installationPrice - (screen.wiringPrice || 0)
                    });
                    comparisonTotalMaterialsPrice += (screen.customerPrice - screen.installationPrice - (screen.wiringPrice || 0));
                }
            }
        });

        // Show track comparison warning if any screens were skipped
        const warningEl = document.getElementById('comparisonTrackWarning');
        if (warningEl) {
            if (comparisonSkippedCount > 0) {
                warningEl.textContent = `${comparisonSkippedCount} screen(s) incompatible with ${getTrackTypeName(comparisonTrack)} (dimensions too large) — shown as N/A.`;
                warningEl.style.display = 'block';
            } else {
                warningEl.style.display = 'none';
            }
        }

        // Apply discount to comparison totals
        const comparisonDiscountAmount = (comparisonTotalMaterialsPrice * discountPercent) / 100;
        comparisonDiscountedMaterialsPrice = comparisonTotalMaterialsPrice - comparisonDiscountAmount;
        comparisonTotalPrice = comparisonDiscountedMaterialsPrice + orderTotalInstallationPrice + orderTotalWiringPrice + miscInstallAmount;
    }

    // Get customer contact/address fields for DB storage
    const companyName = document.getElementById('companyName').value;
    const customerEmail = document.getElementById('customerEmail').value;
    const customerPhone = document.getElementById('customerPhone').value;
    const streetAddress = document.getElementById('streetAddress').value;
    const aptSuite = document.getElementById('aptSuite').value;
    const nearestIntersection = document.getElementById('nearestIntersection').value;
    const city = document.getElementById('city').value;
    const state = document.getElementById('state').value;
    const zipCode = document.getElementById('zipCode').value;

    // Get Airtable integration fields
    const airtableOpportunityId = document.getElementById('airtableOpportunityId').value;
    const airtableContactId = document.getElementById('airtableContactId').value;
    const airtableOpportunityName = document.getElementById('airtableOpportunityName').value;
    const internalComments = document.getElementById('internalComments')?.value || '';

    // Get Sales Rep info from dropdown
    const salesRepSelect = document.getElementById('salesRepSelect');
    const salesRepSelectedOption = salesRepSelect.selectedOptions[0];
    const salesRepId = salesRepSelect.value || '';
    const salesRepName = salesRepSelectedOption && salesRepSelect.value ? salesRepSelectedOption.textContent : '';
    const salesRepEmail = salesRepSelectedOption && salesRepSelect.value ? (salesRepSelectedOption.dataset.email || '') : '';
    const salesRepPhone = salesRepSelectedOption && salesRepSelect.value ? (salesRepSelectedOption.dataset.phone || '') : '';

    // Display order quote summary
    displayOrderQuoteSummary({
        id: currentQuoteId || Date.now(),
        customerName,
        companyName,
        customerEmail,
        customerPhone,
        streetAddress,
        aptSuite,
        nearestIntersection,
        city,
        state,
        zipCode,
        screens: comparisonActive ? comparisonScreens : screensInOrder,
        orderTotalCost,
        orderTotalMaterialsPrice,
        orderTotalInstallationPrice,
        orderTotalWiringCost,
        orderTotalWiringPrice,
        orderTotalPrice,
        orderTotalInstallationCost,
        totalProfit,
        marginPercent,
        hasCableScreen,
        totalScreenCosts,
        totalMotorCosts,
        totalAccessoriesCosts,
        totalCableSurcharge,
        discountPercent,
        discountLabel,
        discountAmount,
        discountedMaterialsPrice,
        enableComparison,
        comparisonType,
        comparisonMotor,
        comparisonTrack,
        comparisonSkippedCount,
        comparisonTotalMaterialsPrice,
        comparisonDiscountedMaterialsPrice,
        comparisonTotalPrice,
        miscInstallLabel,
        miscInstallAmount,
        miscInstallCost,
        projectAccessories: projectAccessories.filter(a => a.quantity > 0),
        projectAccessoriesTotalPrice,
        projectAccessoriesTotalCost,
        airtableOpportunityId,
        airtableContactId,
        airtableOpportunityName,
        internalComments,
        salesRepId,
        salesRepName,
        salesRepEmail,
        salesRepPhone,
        fourWeekGuarantee,
        totalGuaranteeDiscount,
        guaranteeBondBridge,
        sharedAccessoriesDeduction,
        // Preserve finalize page data through recalculate
        measurements: (window.currentOrderData && window.currentOrderData.measurements) || undefined,
        // Entity IDs for sync
        _contactId: currentContactId || null,
        _propertyId: currentPropertyId || null
    });

    // Auto-save after calculating quote
    autoSaveQuote();
    return true;
}

function displayOrderQuoteSummary(orderData) {
    // Store order data globally for finalize page access
    window.currentOrderData = orderData;
    // Sync persistent quote ID so re-saves update the same DB row
    currentQuoteId = orderData.id;

    const summaryContent = document.getElementById('summaryContent');
    const internalInfo = document.getElementById('internalInfo');
    const quoteSummary = document.getElementById('quoteSummary');

    // Get operator/track names for comparison if enabled
    let comparisonLabel = '';
    let primaryLabel = '';
    const hasComparison = orderData.enableComparison && (
        (orderData.comparisonType === 'motor' && orderData.comparisonMotor) ||
        (orderData.comparisonType === 'track' && orderData.comparisonTrack)
    );
    if (hasComparison && orderData.screens.length > 0) {
        if (orderData.comparisonType === 'track') {
            comparisonLabel = getTrackTypeName(orderData.comparisonTrack).replace(' Track', '');
            const firstScreen = orderData.screens.find(s => !s.excluded);
            primaryLabel = firstScreen ? getClientFacingTrackName(firstScreen.trackTypeName) : 'Current';
        } else {
            comparisonLabel = getClientFacingOperatorName(orderData.comparisonMotor, '');
            const firstScreen = orderData.screens.find(s => !s.excluded);
            primaryLabel = firstScreen ? getClientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName) : 'Current';
        }
    }

    // Build address display
    let addressParts = [];
    if (orderData.streetAddress) addressParts.push(orderData.streetAddress);
    if (orderData.aptSuite) addressParts.push(orderData.aptSuite);
    const addressLine1 = addressParts.join(', ');

    let cityStateZip = [];
    if (orderData.city) cityStateZip.push(orderData.city);
    if (orderData.state) cityStateZip.push(orderData.state);
    let addressLine2 = cityStateZip.join(', ');
    if (orderData.zipCode) addressLine2 = addressLine2 ? addressLine2 + ' ' + orderData.zipCode : orderData.zipCode;

    const fullAddress = [addressLine1, addressLine2].filter(x => x).join('<br>');

    // Customer-facing summary
    let customerHTML = `
        <div class="summary-row">
            <strong>Customer:</strong>
            <span>${orderData.customerName}${orderData.companyName ? ' (' + orderData.companyName + ')' : ''}</span>
        </div>
        ${fullAddress ? `<div class="summary-row">
            <strong>Project Address:</strong>
            <span>${fullAddress}</span>
        </div>` : ''}
        ${orderData.nearestIntersection ? `<div class="summary-row">
            <strong>Nearest Intersection:</strong>
            <span>${orderData.nearestIntersection}</span>
        </div>` : ''}
        <div class="summary-row" style="border-bottom: 2px solid #0056A3; padding-bottom: 10px; margin-bottom: 10px;">
            <strong>Total Screens:</strong>
            <span>${orderData.screens.filter(s => !s.excluded).length}</span>
        </div>
        ${orderData.fourWeekGuarantee ? `
        <div style="margin-bottom: 12px; padding: 8px 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
            <strong style="color: #2e7d32;">4-Week Install Guarantee</strong>
        </div>
        ` : ''}
    `;

    // Add each screen details (skip excluded screens)
    orderData.screens.forEach((screen, index) => {
        if (screen.excluded) return;
        const displayName = screen.screenName || `Screen ${index + 1}`;
        const screenMaterialsPrice = screen.customerPrice - (screen.installationPrice || 0) - (screen.wiringPrice || 0);
        const screenInstallPrice = screen.installationPrice || 0;
        const screenWiringPrice = screen.wiringPrice || 0;
        const clientTrackName = getClientFacingTrackName(screen.trackTypeName);
        const clientMotorName = getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName);

        customerHTML += `
            <div style="margin-bottom: 15px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
                <div style="border-bottom: 1px solid #0056A3; padding-bottom: 8px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                        <strong style="flex: 1;">${displayName}</strong>
                    </div>
                    <div style="display: flex; gap: 12px; align-items: flex-start; font-size: 0.9rem;">
                        ${hasComparison ? `
                            <div style="text-align: right; flex: 1;">
                                <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Material</div>
                                <div style="display: flex; gap: 12px; justify-content: flex-end;">
                                    <div>
                                        <div style="font-size: 0.65rem; color: #666;">${primaryLabel}</div>
                                        <strong>${formatCurrency(screenMaterialsPrice)}</strong>
                                    </div>
                                    <div>
                                        <div style="font-size: 0.65rem; color: #666;">${comparisonLabel}</div>
                                        ${screen.comparisonMaterialPrice !== null && screen.comparisonMaterialPrice !== undefined
                                            ? `<strong style="color: #007bff;">${formatCurrency(screen.comparisonMaterialPrice)}</strong>`
                                            : `<strong style="color: #999;">N/A</strong>`}
                                    </div>
                                </div>
                            </div>
                        ` : `
                            <div style="text-align: right; flex: 1;">
                                <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Material</div>
                                <strong>${formatCurrency(screenMaterialsPrice)}</strong>
                            </div>
                        `}
                        <div style="text-align: right;">
                            <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Install</div>
                            <strong>${screen.includeInstallation ? formatCurrency(screenInstallPrice) : '\u2014'}</strong>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 0.7rem; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Wiring</div>
                            <strong>${screenWiringPrice > 0 ? formatCurrency(screenWiringPrice) : '\u2014'}</strong>
                        </div>
                    </div>
                </div>
                <div class="summary-row">
                    <span>Track System:</span>
                    <span>${clientTrackName}</span>
                </div>
                <div class="summary-row">
                    <span>Operator:</span>
                    <span>${clientMotorName}</span>
                </div>
                <div class="summary-row">
                    <span>Fabric:</span>
                    <span>${screen.fabricColorName}</span>
                </div>
                <div class="summary-row">
                    <span>Frame:</span>
                    <span>${screen.frameColorName || 'Not specified'}</span>
                </div>
                <div class="summary-row">
                    <span>Dimensions:</span>
                    <span>${screen.actualWidthDisplay} W x ${screen.actualHeightDisplay} H</span>
                </div>
                ${screen.noTracks ? '<div class="summary-row"><span>Configuration:</span><span>No Tracks</span></div>' : ''}
                ${screen.accessories.length > 0 ? `<div class="summary-row"><span>Accessories:</span><span>${screen.accessories.map(a => a.name).join(', ')}</span></div>` : ''}
            </div>
        `;
    });

    // Show project accessories if any
    if (orderData.projectAccessories && orderData.projectAccessories.length > 0) {
        customerHTML += `
            <div style="margin-bottom: 15px; padding: 10px; background: #f5f0ff; border-radius: 4px;">
                <div style="border-bottom: 1px solid #0056A3; padding-bottom: 8px; margin-bottom: 8px;">
                    <strong>Project Accessories</strong>
                </div>
        `;
        orderData.projectAccessories.forEach(acc => {
            const lineTotal = acc.customerPrice * acc.quantity;
            customerHTML += `
                <div class="summary-row">
                    <span>${acc.name}${acc.quantity > 1 ? ` (x${acc.quantity})` : ''}</span>
                    <span>${formatCurrency(lineTotal)}</span>
                </div>
            `;
        });
        customerHTML += '</div>';
    }

    // Show track comparison skipped warning in summary
    if (hasComparison && orderData.comparisonSkippedCount > 0) {
        customerHTML += `
            <div style="margin-bottom: 12px; padding: 8px 12px; background: #fff3e0; border-left: 4px solid #e67e22; border-radius: 4px; font-size: 0.9rem;">
                <strong style="color: #e67e22;">${orderData.comparisonSkippedCount} screen(s)</strong> incompatible with ${comparisonLabel} — shown as N/A. Comparison totals reflect compatible screens only.
            </div>
        `;
    }

    // Add subtotal, discount, installation, and grand total
    if (hasComparison) {
        // Show comparison columns
        customerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 1.05rem; border-top: 2px solid #0056A3; padding-top: 10px; margin-bottom: 8px;">
                <strong>Materials Subtotal:</strong>
                <div style="display: flex; gap: 20px;">
                    <div style="min-width: 120px; text-align: right;">
                        <div style="font-size: 0.75rem; color: #666; font-weight: normal; margin-bottom: 2px;">${primaryLabel}</div>
                        <strong>${formatCurrency(orderData.orderTotalMaterialsPrice)}</strong>
                    </div>
                    <div style="min-width: 120px; text-align: right;">
                        <div style="font-size: 0.75rem; color: #666; font-weight: normal; margin-bottom: 2px;">${comparisonLabel}</div>
                        <strong style="color: #007bff;">${formatCurrency(orderData.comparisonTotalMaterialsPrice)}</strong>
                    </div>
                </div>
            </div>
        `;

        if (orderData.discountAmount > 0) {
            const comparisonDiscountAmount = (orderData.comparisonTotalMaterialsPrice * orderData.discountPercent) / 100;
            customerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #28a745; margin-bottom: 8px;">
                    <strong>${orderData.discountLabel} (${orderData.discountPercent}%):</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right;">-${formatCurrency(orderData.discountAmount)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #007bff;">-${formatCurrency(comparisonDiscountAmount)}</strong>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 8px;">
                    <strong>Discounted Materials Total:</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right;">${formatCurrency(orderData.discountedMaterialsPrice)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #007bff;">${formatCurrency(orderData.comparisonDiscountedMaterialsPrice)}</strong>
                    </div>
                </div>
            `;
        }

        if (orderData.totalGuaranteeDiscount > 0) {
            customerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; color: #2e7d32; margin-bottom: 8px;">
                    <strong>4-Week Guarantee Savings (included above):</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right; color: #2e7d32;">-${formatCurrency(orderData.totalGuaranteeDiscount)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #2e7d32;">-${formatCurrency(orderData.totalGuaranteeDiscount)}</strong>
                    </div>
                </div>
            `;
        }

        if (orderData.orderTotalInstallationPrice > 0) {
            customerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>Installation Subtotal:</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right;">${formatCurrency(orderData.orderTotalInstallationPrice)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #007bff;">${formatCurrency(orderData.orderTotalInstallationPrice)}</strong>
                    </div>
                </div>
            `;
        }

        if (orderData.orderTotalWiringPrice > 0) {
            customerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>Wiring Subtotal:</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right;">${formatCurrency(orderData.orderTotalWiringPrice)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #007bff;">${formatCurrency(orderData.orderTotalWiringPrice)}</strong>
                    </div>
                </div>
            `;
        }

        if (orderData.miscInstallAmount > 0) {
            customerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong>${orderData.miscInstallLabel}:</strong>
                    <div style="display: flex; gap: 20px;">
                        <strong style="min-width: 120px; text-align: right;">${formatCurrency(orderData.miscInstallAmount)}</strong>
                        <strong style="min-width: 120px; text-align: right; color: #007bff;">${formatCurrency(orderData.miscInstallAmount)}</strong>
                    </div>
                </div>
            `;
        }

        customerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 1.2rem; font-weight: bold; color: #0056A3; margin-top: 8px; padding-top: 12px; border-top: 2px solid #0056A3;">
                <strong>Grand Total:</strong>
                <div style="display: flex; gap: 20px;">
                    <strong style="min-width: 120px; text-align: right;">${formatCurrency(orderData.orderTotalPrice)}</strong>
                    <strong style="min-width: 120px; text-align: right; color: #007bff;">${formatCurrency(orderData.comparisonTotalPrice)}</strong>
                </div>
            </div>
        `;
    } else {
        // Standard single-column display
        customerHTML += `
            <div class="summary-row" style="font-weight: bold; font-size: 1.05rem; border-top: 2px solid #0056A3; padding-top: 10px;">
                <strong>Materials Subtotal:</strong>
                <strong>${formatCurrency(orderData.orderTotalMaterialsPrice)}</strong>
            </div>
        `;

        if (orderData.sharedAccessoriesDeduction > 0) {
            customerHTML += `
                <div class="summary-row" style="color: #6c757d; font-size: 0.9rem;">
                    <em>Shared accessories (one per order) adjustment: -${formatCurrency(orderData.sharedAccessoriesDeduction)}</em>
                </div>
            `;
        }

        if (orderData.discountAmount > 0) {
            customerHTML += `
                <div class="summary-row" style="color: #28a745;">
                    <strong>${orderData.discountLabel} (${orderData.discountPercent}%):</strong>
                    <strong>-${formatCurrency(orderData.discountAmount)}</strong>
                </div>
                <div class="summary-row" style="font-weight: bold;">
                    <strong>Discounted Materials Total:</strong>
                    <strong>${formatCurrency(orderData.discountedMaterialsPrice)}</strong>
                </div>
            `;
        }

        if (orderData.totalGuaranteeDiscount > 0) {
            customerHTML += `
                <div class="summary-row" style="color: #2e7d32;">
                    <strong>4-Week Guarantee Savings (included above):</strong>
                    <strong style="color: #2e7d32;">-${formatCurrency(orderData.totalGuaranteeDiscount)}</strong>
                </div>
            `;
        }

        if (orderData.orderTotalInstallationPrice > 0) {
            customerHTML += `
                <div class="summary-row">
                    <strong>Installation Subtotal:</strong>
                    <strong>${formatCurrency(orderData.orderTotalInstallationPrice)}</strong>
                </div>
            `;
        }

        if (orderData.orderTotalWiringPrice > 0) {
            customerHTML += `
                <div class="summary-row">
                    <strong>Wiring Subtotal:</strong>
                    <strong>${formatCurrency(orderData.orderTotalWiringPrice)}</strong>
                </div>
            `;
        }

        if (orderData.miscInstallAmount > 0) {
            customerHTML += `
                <div class="summary-row">
                    <strong>${orderData.miscInstallLabel}:</strong>
                    <strong>${formatCurrency(orderData.miscInstallAmount)}</strong>
                </div>
            `;
        }

        customerHTML += `
            <div class="summary-row total">
                <strong>Grand Total:</strong>
                <strong>${formatCurrency(orderData.orderTotalPrice)}</strong>
            </div>
        `;
    }

    summaryContent.innerHTML = customerHTML;

    // Internal information
    let internalHTML = `
        <h4 style="margin-bottom: 10px;">Cost Breakdown (Internal)</h4>
        <div class="summary-row">
            <strong>Total Screen Costs:</strong>
            <span>${formatCurrency(orderData.totalScreenCosts)}</span>
        </div>
        <div class="summary-row">
            <strong>Total Motor Costs:</strong>
            <span>${formatCurrency(orderData.totalMotorCosts)}</span>
        </div>
        <div class="summary-row">
            <strong>Total Accessories Costs:</strong>
            <span>${formatCurrency(orderData.totalAccessoriesCosts)}</span>
        </div>
    `;

    if (orderData.totalCableSurcharge > 0) {
        internalHTML += `
            <div class="summary-row">
                <strong>Cable Surcharge:</strong>
                <span>${formatCurrency(orderData.totalCableSurcharge)}</span>
            </div>
        `;
    }

    internalHTML += `
        <div class="summary-row" style="border-top: 1px solid #856404; padding-top: 8px; margin-top: 8px;">
            <strong>Total Materials Cost:</strong>
            <span>${formatCurrency(orderData.orderTotalCost)}</span>
        </div>
        <div class="summary-row">
            <strong>Installation Cost (70% to installer):</strong>
            <span>${formatCurrency(orderData.orderTotalInstallationCost)}</span>
        </div>
        ${orderData.miscInstallAmount > 0 ? `<div class="summary-row" style="font-size: 0.85rem; color: #856404; padding-left: 12px;">
            <em>Includes ${orderData.miscInstallLabel}: ${formatCurrency(orderData.miscInstallCost)} (70% of ${formatCurrency(orderData.miscInstallAmount)})</em>
        </div>` : ''}
        ${(orderData.orderTotalWiringCost > 0 || orderData.orderTotalWiringPrice > 0) ? `<div class="summary-row">
            <strong>Wiring Cost (100% to installer):</strong>
            <span>${formatCurrency(orderData.orderTotalWiringPrice)}</span>
        </div>` : ''}
        <div class="summary-row" style="border-top: 2px solid #856404; padding-top: 8px; margin-top: 8px;">
            <strong>Total Profit:</strong>
            <span style="color: #28a745; font-weight: bold;">${formatCurrency(orderData.totalProfit)}</span>
        </div>
        <div class="summary-row">
            <strong>Margin:</strong>
            <span style="color: #28a745; font-weight: bold;">${orderData.marginPercent.toFixed(1)}%</span>
        </div>
    `;

    internalInfo.innerHTML = internalHTML;
    quoteSummary.classList.remove('hidden');

    // Restore internal comments if present on the order data
    setTimeout(() => {
        const commentsEl = document.getElementById('internalComments');
        if (commentsEl && orderData.internalComments) {
            commentsEl.value = orderData.internalComments;
        }
    }, 0);

    // Load email history if quote has been saved
    if (currentQuoteId) {
        refreshEmailHistory();
    }

    // Update send button state if quote was already sent
    const quoteStatus = orderData.quote_status;
    if (quoteStatus === 'sent' || quoteStatus === 'signed') {
        const sendBtn = document.querySelector('button[onclick="sendQuoteForSignature()"]');
        if (sendBtn) {
            sendBtn.innerHTML = '✓ Quote Sent & Signature Requested';
            sendBtn.style.background = '#28a745';
            sendBtn.disabled = true;
        }
    }

    // Scroll to quote
    quoteSummary.scrollIntoView({ behavior: 'smooth' });
}
// --- Node.js exports (for testing) -------------------------------------------
if (typeof module !== 'undefined') {
    module.exports = {
        calculateQuote, displayQuoteSummary,
        calculateOrderQuote, displayOrderQuoteSummary
    };
}
