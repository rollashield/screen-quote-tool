/**
 * app.js
 * Core application logic for the Screen Quote Tool (index.html).
 *
 * Dependencies:
 *   - pricing-data.js must be loaded first (provides all pricing constants/tables)
 *   - DOM elements from index.html must exist
 *
 * Global state:
 *   - screensInOrder: Array of screen objects in the current order
 *   - editingScreenIndex: Index of screen being edited, or null
 *   - window.currentOrderData: Set by displayOrderQuoteSummary(), read by emailQuote()
 *
 * ORDER DATA SHAPE (window.currentOrderData):
 * {
 *   customerName: string,
 *   screens: Array<{
 *     screenName: string,
 *     trackType: string,              // e.g. 'sunair-zipper'
 *     trackTypeName: string,
 *     operatorType: string,           // e.g. 'gear', 'gaposa-rts', 'somfy-rts'
 *     operatorTypeName: string,
 *     fabricColor: string,
 *     fabricColorName: string,
 *     frameColor: string,
 *     frameColorName: string,
 *     actualWidthDisplay: string,     // e.g. "18' 0.5\""
 *     actualHeightDisplay: string,
 *     customerPrice: number,
 *     installationPrice: number,
 *     totalCost: number,
 *     screenCostOnly: number,
 *     motorCost: number,
 *     accessoriesCost: number,
 *     installationCost: number,
 *     accessories: Array<{name, cost, needsMarkup}>,
 *     isFenetex: boolean,
 *     noTracks: boolean,
 *     includeInstallation: boolean,
 *     trackDeduction: number
 *   }>,
 *   orderTotalCost: number,
 *   orderTotalMaterialsPrice: number,
 *   orderTotalInstallationPrice: number,
 *   orderTotalInstallationCost: number,
 *   orderTotalPrice: number,          // Grand total charged to customer
 *   totalProfit: number,
 *   marginPercent: number,
 *   hasCableScreen: boolean,
 *   totalScreenCosts: number,
 *   totalMotorCosts: number,
 *   totalAccessoriesCosts: number,
 *   totalCableSurcharge: number,
 *   discountPercent: number,
 *   discountLabel: string,
 *   discountAmount: number,
 *   discountedMaterialsPrice: number,
 *   enableComparison: boolean,
 *   comparisonMotor: string,
 *   comparisonTotalMaterialsPrice: number,
 *   comparisonDiscountedMaterialsPrice: number,
 *   comparisonTotalPrice: number,
 *   salesRepId: string,             // Airtable Sales Rep record ID
 *   salesRepName: string,
 *   salesRepEmail: string,
 *   salesRepPhone: string
 * }
 */

// ─── Sales Rep & Airtable ─────────────────────────────────────────────────────
// Functions moved to airtable-search.js:
//   loadSalesReps, updateSalesRepInfo, searchOpportunities, selectOpportunityById,
//   selectOpportunity, selectManualEntry, unlinkOpportunity
// State moved to airtable-search.js: salesRepsList, originalSalesRepId
var currentQuoteId = null; // Persists across recalculate/re-save to prevent duplicate DB rows
var currentContactId = null; // Entity ID for the contact record
var currentPropertyId = null; // Entity ID for the property record

// ─── Shared Helpers ─────────────────────────────────────────────────────────
// Pure functions moved to pricing-engine.js:
//   getTrackTypeOptions, getTrackTypeName, getOperatorOptionsForTrack, getOperatorTypeName,
//   getFabricOptions, getFabricName, getFrameColorOptions, getFrameColorName,
//   escapeAttr, buildSelectOptionsHtml, parseFraction, inchesToFeetAndInches, formatCurrency,
//   getClientFacingOperatorName, getClientFacingTrackName, computeScreenPricing,
//   calculateScreenWithAlternateMotor, calculateScreenWithAlternateTrack

// ─── Project Defaults (REMOVED Phase 7.1) ─────────────────────────────────────
// Quick Config per-opening handles all product preferences now.
// projectDefaults variable kept as empty object for backward compat with saved quotes.

// ─── Quick Config (per-opening product preferences) ────────────────────────
function toggleQuickConfig() {
    const body = document.getElementById('quickConfigBody');
    const icon = document.getElementById('quickConfigToggleIcon');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.innerHTML = '&#9650;';
    } else {
        body.style.display = 'none';
        icon.innerHTML = '&#9660;';
    }
}

function updatePrefOperatorOptions() {
    const trackType = document.getElementById('prefTrackType').value;
    const operatorSelect = document.getElementById('prefOperator');
    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;

    if (!trackType) {
        operatorSelect.innerHTML = '<option value="">-- Select --</option>';
        operatorSelect.disabled = true;
    } else {
        const options = getOperatorOptionsForTrack(trackType, isGuarantee);
        operatorSelect.innerHTML = '<option value="">-- Select --</option>';
        options.forEach(opt => {
            operatorSelect.innerHTML += `<option value="${escapeAttr(opt.value)}">${escapeAttr(opt.label)}</option>`;
        });
        operatorSelect.disabled = false;
    }
}

function resetQuickConfig() {
    document.getElementById('prefTrackType').value = '';
    document.getElementById('prefOperator').value = '';
    document.getElementById('prefOperator').disabled = true;
    document.getElementById('prefFabric').value = '';
    document.getElementById('prefFrameColor').value = '';
    document.getElementById('quickConfigBody').style.display = 'none';
    document.getElementById('quickConfigToggleIcon').innerHTML = '&#9660;';
}

function initQuickConfig() {
    // Populate pref fabric select
    const prefFabric = document.getElementById('prefFabric');
    if (prefFabric) {
        prefFabric.innerHTML = '<option value="">-- Select --</option>';
        getFabricOptions().forEach(opt => {
            prefFabric.innerHTML += `<option value="${escapeAttr(opt.value)}">${escapeAttr(opt.label)}</option>`;
        });
    }

    document.getElementById('prefTrackType').addEventListener('change', updatePrefOperatorOptions);
}

document.addEventListener('DOMContentLoaded', function() {
    loadSavedQuotes();
    loadSalesReps();

    // Sales rep dropdown change handler
    document.getElementById('salesRepSelect').addEventListener('change', updateSalesRepInfo);

    // Toggle optional customer fields
    document.getElementById('toggleOptionalFields').addEventListener('click', function() {
        const optionalFields = document.getElementById('optionalCustomerFields');
        const isHidden = optionalFields.style.display === 'none';

        if (isHidden) {
            optionalFields.style.display = 'block';
            this.textContent = '− Hide Addnl Fields';
        } else {
            optionalFields.style.display = 'none';
            this.textContent = '+ Show Addnl Fields';
        }
    });

    // Update operator options when track type changes
    document.getElementById('trackType').addEventListener('change', function() {
        const trackType = this.value;
        const operatorSelect = document.getElementById('operatorType');
        const noTracksGroup = document.getElementById('noTracksGroup');
        const cableSurchargeInfo = document.getElementById('cableSurchargeInfo');

        operatorSelect.innerHTML = '<option value="">-- Select Operator --</option>';
        operatorSelect.disabled = false;

        const isGuarantee = document.getElementById('fourWeekGuarantee').checked;
        const somfyOption = isGuarantee ? '' : '<option value="somfy-rts">Somfy RTS Motor</option>';

        if (trackType === 'sunair-zipper') {
            operatorSelect.innerHTML += `
                <option value="gear">Gear Operation (Manual)</option>
                <option value="gaposa-rts">Gaposa RTS Motor</option>
                <option value="gaposa-solar">Gaposa Solar Motor</option>
                ${somfyOption}
            `;
            noTracksGroup.style.display = 'flex';
            cableSurchargeInfo.style.display = 'none';
        } else if (trackType === 'sunair-cable') {
            operatorSelect.innerHTML += `
                <option value="gear">Gear Operation (Manual)</option>
                <option value="gaposa-rts">Gaposa RTS Motor</option>
                <option value="gaposa-solar">Gaposa Solar Motor</option>
                ${somfyOption}
            `;
            noTracksGroup.style.display = 'none';
            document.getElementById('noTracks').checked = false;
            cableSurchargeInfo.style.display = 'block';
        } else if (trackType === 'fenetex-keder') {
            operatorSelect.innerHTML += `
                <option value="gaposa-rts">Gaposa RTS Motor (Included)</option>
            `;
            noTracksGroup.style.display = 'none';
            document.getElementById('noTracks').checked = false;
            cableSurchargeInfo.style.display = 'none';
        } else {
            operatorSelect.disabled = true;
            noTracksGroup.style.display = 'none';
            cableSurchargeInfo.style.display = 'none';
        }

        // Clear operator selection
        operatorSelect.value = '';
        updateAccessories();
        checkDimensionLimits();
    });

    // Update accessories when operator type changes
    document.getElementById('operatorType').addEventListener('change', function() {
        updateAccessories();
        updateComparisonOptions();
        updateWiringVisibility();
    });

    // Toggle wiring visibility when installation checkbox changes
    document.getElementById('includeInstallation').addEventListener('change', function() {
        updateWiringVisibility();
    });

    // Photo input handler
    document.getElementById('photoInput').addEventListener('change', handlePhotoSelect);

    // Update pricing dimensions and check dimension limits when measurements change
    ['widthInches', 'widthFraction', 'heightInches', 'heightFraction'].forEach(id => {
        document.getElementById(id).addEventListener('input', function() {
            updatePricingDimensions();
            checkDimensionLimits();
            updateDropdownCompatibility();
        });
    });

    // Enable/disable comparison options
    document.getElementById('enableComparison').addEventListener('change', function() {
        const comparisonOptions = document.getElementById('comparisonOptions');
        comparisonOptions.style.display = this.checked ? 'grid' : 'none';
        if (!this.checked) {
            document.getElementById('comparisonMotor').value = '';
            document.getElementById('comparisonTrack').value = '';
            const warningEl = document.getElementById('comparisonTrackWarning');
            if (warningEl) warningEl.style.display = 'none';
        } else {
            updateComparisonUI();
        }
    });

    // Comparison type radio toggle
    document.querySelectorAll('input[name="comparisonType"]').forEach(radio => {
        radio.addEventListener('change', updateComparisonUI);
    });

    // ── Airtable Opportunity Search ──
    let oppSearchTimeout = null;
    document.getElementById('opportunitySearch').addEventListener('input', function() {
        const query = this.value.trim();
        clearTimeout(oppSearchTimeout);

        if (query.length < 2) {
            document.getElementById('opportunitySearchResults').style.display = 'none';
            return;
        }

        oppSearchTimeout = setTimeout(() => searchOpportunities(query), 300);
    });

    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        const searchBar = document.getElementById('opportunitySearchBar');
        if (searchBar && !searchBar.contains(e.target)) {
            document.getElementById('opportunitySearchResults').style.display = 'none';
        }
    });

    // Set initial wiring field visibility based on default checkbox state
    updateWiringVisibility();

    // Set initial Phase 1 header text
    updatePhase1Header();

    // Initialize quick config panel
    initQuickConfig();

    // ── Auto-save: blur handlers on Phase 1 fields ──
    // When editing an existing opening and the user tabs away from a field,
    // sync form values to the in-memory screen object and auto-save.
    function syncPhase1FormToScreen() {
        if (editingScreenIndex === null) return;
        const screen = screensInOrder[editingScreenIndex];
        if (!screen) return;

        screen.screenName = document.getElementById('screenName').value.trim() || null;
        screen.widthInputValue = document.getElementById('widthInches').value;
        screen.widthFractionValue = document.getElementById('widthFraction').value;
        screen.heightInputValue = document.getElementById('heightInches').value;
        screen.heightFractionValue = document.getElementById('heightFraction').value;

        const widthInches = parseInt(screen.widthInputValue) || 0;
        const widthFraction = parseFraction(screen.widthFractionValue);
        const heightInches = parseInt(screen.heightInputValue) || 0;
        const heightFraction = parseFraction(screen.heightFractionValue);

        screen.totalWidthInches = widthInches + widthFraction;
        screen.totalHeightInches = heightInches + heightFraction;
        screen.width = Math.ceil(screen.totalWidthInches / 12);
        screen.height = Math.ceil(screen.totalHeightInches / 12);
        screen.actualWidthDisplay = inchesToFeetAndInches(screen.totalWidthInches);
        screen.actualHeightDisplay = inchesToFeetAndInches(screen.totalHeightInches);
        screen.includeInstallation = document.getElementById('includeInstallation').checked;
        screen.wiringDistance = parseInt(document.getElementById('wiringDistance').value) || 0;
    }

    const phase1AutoSaveFields = ['screenName', 'widthInches', 'widthFraction', 'heightInches', 'heightFraction', 'wiringDistance'];
    phase1AutoSaveFields.forEach(fieldId => {
        const el = document.getElementById(fieldId);
        if (el) {
            el.addEventListener('blur', function() {
                if (editingScreenIndex !== null && currentQuoteId) {
                    syncPhase1FormToScreen();
                    debouncedAutoSaveOpening(editingScreenIndex);
                }
            });
        }
    });
    // Installation checkbox change also triggers auto-save
    document.getElementById('includeInstallation').addEventListener('change', function() {
        if (editingScreenIndex !== null && currentQuoteId) {
            syncPhase1FormToScreen();
            debouncedAutoSaveOpening(editingScreenIndex);
        }
    });
});

// ─── Airtable Opportunity Search & Selection ────────────────────────────────
// Functions moved to airtable-search.js:
//   searchOpportunities, selectOpportunityById, selectOpportunity,
//   selectManualEntry, unlinkOpportunity

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ─── Save Guard ─────────────────────────────────────────────────────────────
var isSaving = false;

function handleGuaranteeToggle() {
    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;
    const operatorSelect = document.getElementById('operatorType');
    const trackType = document.getElementById('trackType').value;

    // If enabling guarantee and Somfy is currently selected, reset operator
    if (isGuarantee && operatorSelect.value === 'somfy-rts') {
        alert('Somfy motors are not available with the 4-Week Install Guarantee. Please select a Gaposa motor.');
    }

    // Save current operator before rebuild (trackType change clears it)
    const savedOperator = operatorSelect.value;
    const shouldRestore = isGuarantee ? savedOperator !== 'somfy-rts' : true;

    // Re-trigger trackType change to rebuild operator options (with or without Somfy)
    if (trackType) {
        document.getElementById('trackType').dispatchEvent(new Event('change'));
        // Restore selected operator after dropdown rebuild
        if (shouldRestore && savedOperator) {
            operatorSelect.value = savedOperator;
            operatorSelect.dispatchEvent(new Event('change'));
        }
    }
}

function updatePricingDimensions() {
    const widthInches = parseFloat(document.getElementById('widthInches').value) || 0;
    const widthFraction = parseFraction(document.getElementById('widthFraction').value);
    const heightInches = parseFloat(document.getElementById('heightInches').value) || 0;
    const heightFraction = parseFraction(document.getElementById('heightFraction').value);

    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;

    if (totalWidthInches > 0 || totalHeightInches > 0) {
        const widthDisplay = inchesToFeetAndInches(totalWidthInches);
        const heightDisplay = inchesToFeetAndInches(totalHeightInches);

        const pricingWidth = Math.round(totalWidthInches / 12);
        const pricingHeight = Math.round(totalHeightInches / 12);

        document.getElementById('pricingDimensions').textContent =
            `${widthDisplay} W x ${heightDisplay} H (pricing based on ${pricingWidth}' x ${pricingHeight}')`;
        document.getElementById('dimensionsSummary').style.display = 'block';
    } else {
        document.getElementById('dimensionsSummary').style.display = 'none';
    }
}

function updateComparisonOptions() {
    const operatorType = document.getElementById('operatorType').value;
    const trackType = document.getElementById('trackType').value;
    const comparisonMotor = document.getElementById('comparisonMotor');

    comparisonMotor.innerHTML = '<option value="">-- Select Option to Compare --</option>';

    if (!trackType || !operatorType) {
        return;
    }

    // Build list of alternative operators based on current selection
    const motorOptions = [];

    if (trackType === 'sunair-zipper' || trackType === 'sunair-cable') {
        if (operatorType !== 'gear') {
            motorOptions.push({value: 'gear', label: 'Manual Gear Operation'});
        }
        if (operatorType !== 'gaposa-rts') {
            motorOptions.push({value: 'gaposa-rts', label: 'Remote-Operated Motor'});
        }
        if (operatorType !== 'gaposa-solar') {
            motorOptions.push({value: 'gaposa-solar', label: 'Solar Motor'});
        }
        if (operatorType !== 'somfy-rts') {
            motorOptions.push({value: 'somfy-rts', label: 'Somfy RTS Motor'});
        }
    }

    motorOptions.forEach(opt => {
        comparisonMotor.innerHTML += `<option value="${opt.value}">${opt.label}</option>`;
    });
}

function updateComparisonUI() {
    const compType = document.querySelector('input[name="comparisonType"]:checked')?.value || 'motor';
    document.getElementById('comparisonMotorGroup').style.display = compType === 'motor' ? 'grid' : 'none';
    document.getElementById('comparisonTrackGroup').style.display = compType === 'track' ? 'grid' : 'none';
}

function updateWiringVisibility() {
    const operatorType = document.getElementById('operatorType').value;
    const includeInstallation = document.getElementById('includeInstallation').checked;
    const wiringGroup = document.getElementById('wiringGroup');

    // In Phase 1 (no motor selected yet), show wiring whenever installation is checked
    // so the rep can capture the distance on-site. In Phase 2, restrict to RTS motors only.
    const isRts = operatorType === 'gaposa-rts' || operatorType === 'somfy-rts';
    const noMotorSelected = !operatorType;
    if (includeInstallation && (isRts || noMotorSelected)) {
        wiringGroup.style.display = 'block';
    } else {
        wiringGroup.style.display = 'none';
        document.getElementById('wiringDistance').value = '';
    }
}

function updateAccessories() {
    const operatorType = document.getElementById('operatorType').value;
    const accessoriesList = document.getElementById('accessoriesList');

    let motorType = null;
    if (operatorType === 'gaposa-rts' || operatorType === 'gaposa-solar') {
        motorType = 'gaposa';
    } else if (operatorType === 'somfy-rts') {
        motorType = 'somfy';
    }

    if (!motorType) {
        accessoriesList.innerHTML = '<p>Please select a motorized operator to see available accessories.</p>';
        return;
    }

    let availableAccessories = accessories[motorType];

    // Filter out extension cord for non-solar motors
    if (operatorType !== 'gaposa-solar') {
        availableAccessories = availableAccessories.filter(acc => acc.id !== 'gaposa-solar-ext');
    }

    // Filter out Bond Bridge from per-screen accessories (project-level only)
    availableAccessories = availableAccessories.filter(acc => acc.id !== 'bond-bridge');

    let html = '';

    availableAccessories.forEach(acc => {
        html += `
            <div class="accessory-item">
                <input type="checkbox" id="${acc.id}" data-cost="${acc.cost}" data-markup="${acc.markup}" data-name="${acc.name}">
                <label for="${acc.id}">${acc.name}</label>
            </div>
        `;
    });

    accessoriesList.innerHTML = html;
}

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
    let wiringDistance = 0;
    let wiringCost = 0;
    let wiringPrice = 0;
    const isRts = operatorType === 'gaposa-rts' || operatorType === 'somfy-rts';
    if (includeInstallation && isRts) {
        wiringDistance = parseInt(document.getElementById('wiringDistance').value) || 0;
        if (wiringDistance > 0) {
            wiringCost = wiringDistance * WIRING_COST_PER_INCH;
            wiringPrice = wiringDistance * WIRING_PRICE_PER_INCH;
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
                <strong>Wiring (${quote.wiringDistance}"):</strong>
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
            <strong>Wiring Cost (${quote.wiringDistance}"):</strong>
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

// ─── Auto-Save (individual opening PATCH/POST) ──────────────────────────────
let autoSaveTimers = {}; // Per-screen debounce timers, keyed by screen index
const AUTO_SAVE_DEBOUNCE_MS = 1500;

/**
 * Auto-save a single opening to D1 via PATCH (update) or POST (create).
 * Only fires when currentQuoteId exists and the opening has valid dimensions.
 * Also uploads any pending photos to R2 and patches the opening's photos array.
 * Silent — no alerts or UI disruption on success. Logs errors to console.
 */
async function autoSaveOpening(screenIndex) {
    if (!currentQuoteId) return;
    const screen = screensInOrder[screenIndex];
    if (!screen) return;

    // Only auto-save openings with non-zero width AND height
    if (!screen.totalWidthInches || !screen.totalHeightInches) return;

    // Upload pending photos first (if any) so they're included in the save
    if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
        try {
            const uploaded = await uploadPendingPhotos(String(currentQuoteId), screenIndex, screen.pendingPhotos);
            screen.photos = (screen.photos || []).concat(uploaded);
            screen.pendingPhotos = [];
            // Update photo globals and preview if this screen is currently being edited
            if (editingScreenIndex === screenIndex) {
                existingScreenPhotos = screen.photos.slice();
                pendingScreenPhotos = [];
                renderPhotoPreview();
            }
        } catch (err) {
            console.error('Auto-save photo upload failed:', err);
        }
    }

    const openingData = {
        quoteId: String(currentQuoteId),
        name: screen.screenName || null,
        widthInches: screen.widthInputValue || null,
        widthFraction: screen.widthFractionValue || null,
        heightInches: screen.heightInputValue || null,
        heightFraction: screen.heightFractionValue || null,
        widthFeet: screen.width,
        heightFeet: screen.height,
        widthDisplay: screen.actualWidthDisplay,
        heightDisplay: screen.actualHeightDisplay,
        includeInstallation: screen.includeInstallation,
        wiringDistance: screen.wiringDistance || 0,
        photos: (screen.photos || []).filter(p => typeof p === 'object' && p.key),
        sortOrder: screenIndex,
        status: screen.phase === 'configured' ? 'configured' : 'documented'
    };

    try {
        if (screen._openingId) {
            // PATCH existing opening
            await fetch(`${WORKER_URL}/api/openings/${screen._openingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(openingData)
            });
        } else {
            // POST new opening, store the ID back
            const response = await fetch(`${WORKER_URL}/api/openings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(openingData)
            });
            const result = await response.json();
            if (result.success && result.openingId) {
                screensInOrder[screenIndex]._openingId = result.openingId;
            }
        }
        showAutoSaveIndicator();
    } catch (err) {
        console.error('Auto-save opening failed:', err);
    }
}

/**
 * Debounced auto-save for a specific screen index.
 */
function debouncedAutoSaveOpening(screenIndex) {
    clearTimeout(autoSaveTimers[screenIndex]);
    autoSaveTimers[screenIndex] = setTimeout(() => autoSaveOpening(screenIndex), AUTO_SAVE_DEBOUNCE_MS);
}

/**
 * Show a brief "Auto-saved" indicator near the save draft button.
 */
function showAutoSaveIndicator() {
    let indicator = document.getElementById('autoSaveIndicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.id = 'autoSaveIndicator';
        indicator.style.cssText = 'font-size: 0.8rem; color: #28a745; margin-left: 10px; opacity: 0; transition: opacity 0.3s;';
        const draftBtn = document.getElementById('saveDraftBtn');
        if (draftBtn && draftBtn.parentNode) {
            draftBtn.parentNode.insertBefore(indicator, draftBtn.nextSibling);
        }
    }
    indicator.textContent = 'Auto-saved';
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
}

// ─── Save Draft (Phase 1 only — no pricing required) ────────────────────────
async function saveDraft() {
    if (isSaving) return;

    if (screensInOrder.length === 0) {
        alert('Please add at least one opening before saving a draft.');
        return;
    }

    isSaving = true;
    const draftBtn = document.getElementById('saveDraftBtn');
    if (draftBtn) draftBtn.disabled = true;

    try {
        // Reuse existing quote ID if we're re-saving, else generate new
        const tempId = (currentQuoteId || Date.now()).toString();

        // Upload pending photos
        for (let i = 0; i < screensInOrder.length; i++) {
            const screen = screensInOrder[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(tempId, i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }

        // Strip Blob objects before serialization
        const screensForSave = screensInOrder.map(s => {
            const { pendingPhotos, ...rest } = s;
            return rest;
        });

        // Get sales rep info
        const salesRepSelect = document.getElementById('salesRepSelect');
        const selectedRepOption = salesRepSelect?.selectedOptions[0];
        const salesRepId = salesRepSelect?.value || '';
        const salesRepName = selectedRepOption?.textContent || '';
        const salesRepEmail = selectedRepOption?.dataset?.email || '';
        const salesRepPhone = selectedRepOption?.dataset?.phone || '';

        const quoteData = {
            id: tempId,
            customerName: document.getElementById('customerName').value || 'Draft',
            companyName: document.getElementById('companyName').value || '',
            customerEmail: document.getElementById('customerEmail').value || '',
            customerPhone: document.getElementById('customerPhone').value || '',
            streetAddress: document.getElementById('streetAddress').value || '',
            aptSuite: document.getElementById('aptSuite').value || '',
            nearestIntersection: document.getElementById('nearestIntersection').value || '',
            city: document.getElementById('city').value || '',
            state: document.getElementById('state').value || '',
            zipCode: document.getElementById('zipCode').value || '',
            screens: screensForSave,
            orderTotalPrice: 0,
            orderTotalMaterialsPrice: 0,
            orderTotalInstallationPrice: 0,
            orderTotalInstallationCost: 0,
            orderTotalCost: 0,
            totalProfit: 0,
            marginPercent: 0,
            hasCableScreen: false,
            totalScreenCosts: 0,
            totalMotorCosts: 0,
            totalAccessoriesCosts: 0,
            totalCableSurcharge: 0,
            discountPercent: parseFloat(document.getElementById('discountPercent').value) || 0,
            discountLabel: document.getElementById('discountLabel').value || '',
            discountAmount: 0,
            discountedMaterialsPrice: 0,
            enableComparison: false,
            comparisonType: 'motor',
            comparisonMotor: '',
            comparisonTrack: '',
            comparisonSkippedCount: 0,
            comparisonTotalMaterialsPrice: 0,
            comparisonDiscountedMaterialsPrice: 0,
            comparisonTotalPrice: 0,
            miscInstallLabel: document.getElementById('miscInstallLabel').value || '',
            miscInstallAmount: parseFloat(document.getElementById('miscInstallAmount').value) || 0,
            miscInstallCost: 0,
            projectAccessories: [],
            projectAccessoriesTotalPrice: 0,
            projectAccessoriesTotalCost: 0,
            airtableOpportunityId: document.getElementById('airtableOpportunityId').value || '',
            airtableContactId: document.getElementById('airtableContactId').value || '',
            airtableOpportunityName: document.getElementById('airtableOpportunityName').value || '',
            internalComments: document.getElementById('internalComments')?.value || '',
            salesRepId, salesRepName, salesRepEmail, salesRepPhone,
            fourWeekGuarantee: document.getElementById('fourWeekGuarantee').checked,
            totalGuaranteeDiscount: 0,
            // Entity IDs for sync (passed back to worker)
            _contactId: currentContactId || null,
            _propertyId: currentPropertyId || null
        };

        const response = await fetch(`${WORKER_URL}/api/save-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (!currentQuoteId) currentQuoteId = tempId; // Lock ID for future re-saves
            // Store entity IDs returned by the worker
            if (result.entities) {
                currentContactId = result.entities.contactId || currentContactId;
                currentPropertyId = result.entities.propertyId || currentPropertyId;
                // Map entity IDs back onto screen objects
                if (result.entities.openingIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.openingIds[i]) s._openingId = result.entities.openingIds[i];
                    });
                }
                if (result.entities.lineItemIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.lineItemIds[i]) s._lineItemId = result.entities.lineItemIds[i];
                    });
                }
            }
            alert(`Draft saved!\nQuote #: ${result.quoteNumber || 'N/A'}\n\nYou can load this draft later to finish configuration.`);
            loadSavedQuotes();
        } else {
            alert('Failed to save draft: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving draft:', error);
        alert('Failed to save draft. Check your internet connection.\n\nError: ' + error.message);
    } finally {
        isSaving = false;
        if (draftBtn) draftBtn.disabled = false;
    }
}

async function saveQuote() {
    if (isSaving) return;

    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first');
        return;
    }

    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary.classList.contains('hidden')) {
        alert('Please calculate a quote first');
        return;
    }

    isSaving = true;
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (finalizeBtn) finalizeBtn.disabled = true;

    try {
        // Read fresh internal comments from textarea (may have changed since calculate)
        const internalComments = document.getElementById('internalComments')?.value || '';

        // Build the quote payload from currentOrderData
        const orderData = window.currentOrderData;
        orderData.internalComments = internalComments;

        // Upload pending photos and clean up deletions
        const quoteId = orderData.id.toString();
        for (let i = 0; i < orderData.screens.length; i++) {
            const screen = orderData.screens[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(quoteId, i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }
        await deleteMarkedPhotos();

        // Strip Blob objects before serialization
        const screensForSave = orderData.screens.map(s => {
            const { pendingPhotos, ...rest } = s;
            return rest;
        });

        const quoteData = {
            id: quoteId,
            customerName: orderData.customerName,
            companyName: orderData.companyName || '',
            customerEmail: orderData.customerEmail || '',
            customerPhone: orderData.customerPhone || '',
            streetAddress: orderData.streetAddress || '',
            aptSuite: orderData.aptSuite || '',
            nearestIntersection: orderData.nearestIntersection || '',
            city: orderData.city || '',
            state: orderData.state || '',
            zipCode: orderData.zipCode || '',
            screens: screensForSave,
            orderTotalPrice: orderData.orderTotalPrice,
            orderTotalMaterialsPrice: orderData.orderTotalMaterialsPrice,
            orderTotalInstallationPrice: orderData.orderTotalInstallationPrice,
            orderTotalInstallationCost: orderData.orderTotalInstallationCost,
            orderTotalCost: orderData.orderTotalCost,
            totalProfit: orderData.totalProfit,
            marginPercent: orderData.marginPercent,
            hasCableScreen: orderData.hasCableScreen,
            totalScreenCosts: orderData.totalScreenCosts,
            totalMotorCosts: orderData.totalMotorCosts,
            totalAccessoriesCosts: orderData.totalAccessoriesCosts,
            totalCableSurcharge: orderData.totalCableSurcharge,
            discountPercent: orderData.discountPercent,
            discountLabel: orderData.discountLabel,
            discountAmount: orderData.discountAmount,
            discountedMaterialsPrice: orderData.discountedMaterialsPrice,
            enableComparison: orderData.enableComparison,
            comparisonType: orderData.comparisonType || 'motor',
            comparisonMotor: orderData.comparisonMotor,
            comparisonTrack: orderData.comparisonTrack || '',
            comparisonSkippedCount: orderData.comparisonSkippedCount || 0,
            comparisonTotalMaterialsPrice: orderData.comparisonTotalMaterialsPrice,
            comparisonDiscountedMaterialsPrice: orderData.comparisonDiscountedMaterialsPrice,
            comparisonTotalPrice: orderData.comparisonTotalPrice,
            // Extra misc install cost
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: orderData.miscInstallAmount || 0,
            miscInstallCost: orderData.miscInstallCost || 0,
            // Project-level accessories
            projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
            projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
            projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
            // Airtable integration fields
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            airtableOpportunityName: orderData.airtableOpportunityName || '',
            internalComments: internalComments,
            // Sales Rep info
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || '',
            // 4-Week Install Guarantee
            fourWeekGuarantee: orderData.fourWeekGuarantee || false,
            totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0,
            // Entity IDs for sync (passed back to worker)
            _contactId: currentContactId || null,
            _propertyId: currentPropertyId || null
        };

        // If sales rep changed and opportunity is linked, update Airtable
        const currentRepId = orderData.salesRepId || '';
        if (currentRepId && originalSalesRepId && currentRepId !== originalSalesRepId && orderData.airtableOpportunityId) {
            try {
                await fetch(`${WORKER_URL}/api/airtable/opportunities/update-rep`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        opportunityId: orderData.airtableOpportunityId,
                        salesRepId: currentRepId
                    })
                });
                originalSalesRepId = currentRepId; // Update tracked ID after successful change
            } catch (repError) {
                console.error('Failed to update sales rep on Airtable:', repError);
                // Non-blocking — quote still saves
            }
        }

        const response = await fetch(`${WORKER_URL}/api/save-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (!currentQuoteId) currentQuoteId = quoteId; // Lock ID for future re-saves
            // Write quoteNumber back so PDFs generated after saving show the real number
            if (result.quoteNumber) {
                window.currentOrderData.quoteNumber = result.quoteNumber;
            }
            // Store entity IDs returned by the worker
            if (result.entities) {
                currentContactId = result.entities.contactId || currentContactId;
                currentPropertyId = result.entities.propertyId || currentPropertyId;
                if (result.entities.openingIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.openingIds[i]) s._openingId = result.entities.openingIds[i];
                    });
                }
                if (result.entities.lineItemIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.lineItemIds[i]) s._lineItemId = result.entities.lineItemIds[i];
                    });
                }
            }
            let msg = `Quote saved successfully!\nQuote #: ${result.quoteNumber || 'N/A'}`;
            if (result.airtableSync === false) {
                msg += '\n\nNote: Airtable sync failed. Quote saved locally only.';
                if (result.airtableSyncError) {
                    msg += '\nReason: ' + result.airtableSyncError;
                }
            }
            alert(msg);
            loadSavedQuotes();
        } else {
            alert('Failed to save quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving quote:', error);
        alert('Failed to save quote. Please check your internet connection.\n\nError: ' + error.message);
    } finally {
        isSaving = false;
        if (finalizeBtn) finalizeBtn.disabled = false;
    }
}

async function loadSavedQuotes() {
    const savedQuotesList = document.getElementById('savedQuotesList');
    savedQuotesList.innerHTML = '<p style="color: #666;">Loading quotes...</p>';

    try {
        const response = await fetch(`${WORKER_URL}/api/quotes`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            savedQuotesList.innerHTML = '<p style="color: #c00;">Failed to load quotes.</p>';
            return;
        }

        const quotes = result.quotes;

        if (!quotes || quotes.length === 0) {
            savedQuotesList.innerHTML = '<p style="color: #666;">No saved quotes yet.</p>';
            return;
        }

        let html = '';
        quotes.forEach(quote => {
            const date = new Date(quote.created_at).toLocaleDateString();
            const screenCount = quote.screen_count || 0;
            const isDraft = !quote.total_price || quote.total_price === 0;
            const totalPrice = isDraft ? null : formatCurrency(quote.total_price);
            const quoteNum = quote.quote_number ? `<p><strong>Quote #:</strong> ${quote.quote_number}</p>` : '';

            // Status badge logic
            const quoteStatus = quote.quote_status || 'draft';
            const paymentStatus = quote.payment_status || 'unpaid';
            let statusBadge = '';
            let borderColor = '';
            if (paymentStatus === 'paid') {
                statusBadge = '<span style="background: #6f42c1; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">PAID</span>';
                borderColor = '#6f42c1';
            } else if (quoteStatus === 'signed') {
                statusBadge = '<span style="background: #28a745; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">SIGNED</span>';
                borderColor = '#28a745';
            } else if (quoteStatus === 'sent') {
                statusBadge = '<span style="background: #0071bc; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">SENT</span>';
                borderColor = '#0071bc';
            } else if (isDraft) {
                statusBadge = '<span style="background: #e67e22; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">DRAFT</span>';
                borderColor = '#e67e22';
            }

            html += `
                <div class="quote-card" ${borderColor ? `style="border-left: 3px solid ${borderColor};"` : ''}>
                    <h4>${quote.customer_name}${statusBadge}</h4>
                    ${quoteNum}
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Screens:</strong> ${screenCount}</p>
                    ${totalPrice ? `<p><strong>Total:</strong> ${totalPrice}</p>` : ''}
                    <div class="quote-card-actions">
                        <button class="btn-primary" onclick="loadQuote('${quote.id}')">Load</button>
                        <button class="btn-secondary" onclick="viewSentEmails('${quote.id}')">Emails</button>
                        <button class="btn-secondary" onclick="deleteQuote('${quote.id}')">Delete</button>
                    </div>
                </div>
            `;
        });

        savedQuotesList.innerHTML = html;
    } catch (error) {
        console.error('Error loading quotes:', error);
        savedQuotesList.innerHTML = '<p style="color: #c00;">Failed to load quotes. Check your connection.</p>';
    }
}

async function loadQuote(quoteId) {
    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            alert('Failed to load quote: ' + (result.error || 'Quote not found'));
            return;
        }

        const quote = result.quote;
        currentQuoteId = quote.id; // Preserve loaded quote's ID for re-save

        // Store entity IDs from lazy migration or cached response
        const entities = result.entities || {};
        currentContactId = entities.contactId || null;
        currentPropertyId = entities.propertyId || null;

        // Map entity IDs onto screen objects (by index, matching openingIds/lineItemIds arrays)
        if (entities.openingIds && quote.screens) {
            quote.screens.forEach((screen, i) => {
                if (entities.openingIds[i]) screen._openingId = entities.openingIds[i];
            });
        }
        if (entities.lineItemIds && quote.screens) {
            quote.screens.forEach((screen, i) => {
                if (entities.lineItemIds[i]) screen._lineItemId = entities.lineItemIds[i];
            });
        }

        // Populate customer fields
        document.getElementById('customerName').value = quote.customerName || '';
        document.getElementById('companyName').value = quote.companyName || '';
        document.getElementById('customerEmail').value = quote.customerEmail || '';
        document.getElementById('customerPhone').value = quote.customerPhone || '';
        document.getElementById('streetAddress').value = quote.streetAddress || '';
        document.getElementById('aptSuite').value = quote.aptSuite || '';
        document.getElementById('nearestIntersection').value = quote.nearestIntersection || '';
        document.getElementById('city').value = quote.city || '';
        document.getElementById('state').value = quote.state || '';
        document.getElementById('zipCode').value = quote.zipCode || '';

        // Show optional fields if any have values
        if (quote.companyName || quote.aptSuite || quote.nearestIntersection) {
            document.getElementById('optionalCustomerFields').style.display = 'block';
            document.getElementById('toggleOptionalFields').textContent = '− Hide Addnl Fields';
        }

        // Restore Airtable link state
        if (quote.airtableOpportunityId) {
            document.getElementById('airtableOpportunityId').value = quote.airtableOpportunityId;
            document.getElementById('airtableContactId').value = quote.airtableContactId || '';
            document.getElementById('airtableOpportunityName').value = quote.airtableOpportunityName || '';
            const banner = document.getElementById('linkedOpportunityBanner');
            banner.classList.remove('hidden');
            banner.style.display = 'flex';
            const oppName = quote.airtableOpportunityName || '';
            document.getElementById('linkedOpportunityText').textContent =
                'Linked to Airtable Opportunity' + (oppName ? ' ' + oppName : '');
        } else {
            document.getElementById('airtableOpportunityId').value = '';
            document.getElementById('airtableContactId').value = '';
            document.getElementById('airtableOpportunityName').value = '';
            const banner = document.getElementById('linkedOpportunityBanner');
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }

        // Restore Sales Rep dropdown
        if (quote.salesRepId) {
            document.getElementById('salesRepSelect').value = quote.salesRepId;
            originalSalesRepId = quote.salesRepId;
        } else if (quote.salesRepName) {
            // Legacy fallback: match by name if no ID saved
            const select = document.getElementById('salesRepSelect');
            for (const option of select.options) {
                if (option.textContent === quote.salesRepName) {
                    select.value = option.value;
                    originalSalesRepId = option.value;
                    break;
                }
            }
        } else {
            document.getElementById('salesRepSelect').value = '';
            originalSalesRepId = '';
        }
        updateSalesRepInfo();

        // Restore screens into the order
        if (quote.screens && quote.screens.length > 0) {
            // Backward compatibility: screens without phase field default to 'configured'
            quote.screens.forEach(s => {
                if (!s.phase) s.phase = 'configured';
            });

            screensInOrder = quote.screens;
            renderScreensList();
            document.getElementById('screensInOrder').classList.remove('hidden');

            // Restore discount settings
            document.getElementById('discountPercent').value = quote.discountPercent || 0;
            document.getElementById('discountLabel').value = quote.discountLabel || '';

            // Restore misc install fields
            document.getElementById('miscInstallLabel').value = quote.miscInstallLabel || '';
            document.getElementById('miscInstallAmount').value = quote.miscInstallAmount || '';

            // Restore project accessories
            if (quote.projectAccessories && quote.projectAccessories.length > 0) {
                projectAccessories = quote.projectAccessories;
            } else {
                projectAccessories = [];
            }

            // Restore comparison settings
            if (quote.enableComparison) {
                document.getElementById('enableComparison').checked = true;
                document.getElementById('comparisonOptions').style.display = 'grid';
                // Restore comparison type radio
                const compType = quote.comparisonType || 'motor';
                const compRadio = document.querySelector(`input[name="comparisonType"][value="${compType}"]`);
                if (compRadio) compRadio.checked = true;
                updateComparisonUI();
                // Restore motor/track selection
                if (quote.comparisonMotor) {
                    document.getElementById('comparisonMotor').value = quote.comparisonMotor;
                }
                if (quote.comparisonTrack) {
                    document.getElementById('comparisonTrack').value = quote.comparisonTrack;
                }
            }

            // Restore guarantee checkbox
            if (quote.fourWeekGuarantee) {
                document.getElementById('fourWeekGuarantee').checked = true;
            }

            // Only show order summary if all screens are configured (not a draft)
            const hasUnconfigured = quote.screens.some(s => s.phase === 'opening');
            if (!hasUnconfigured) {
                window.currentOrderData = quote;
                displayOrderQuoteSummary(quote);
            }
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading quote:', error);
        alert('Failed to load quote. Please check your internet connection.\n\nError: ' + error.message);
    }
}

async function deleteQuote(quoteId) {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            loadSavedQuotes();
        } else {
            alert('Failed to delete quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting quote:', error);
        alert('Failed to delete quote. Please check your internet connection.\n\nError: ' + error.message);
    }
}

// ─── Sent Emails Viewer ──────────────────────────────────────────────────────
async function viewSentEmails(quoteId) {
    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/emails`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            alert('Failed to load emails: ' + (result.error || 'Unknown error'));
            return;
        }

        const emails = result.emails || [];
        showEmailsModal(emails);
    } catch (error) {
        console.error('Error loading emails:', error);
        alert('Failed to load emails.');
    }
}

function showEmailsModal(emails) {
    // Remove existing modal if any
    const existing = document.getElementById('emailsModal');
    if (existing) existing.remove();

    const typeLabels = {
        'quote': 'Quote Email',
        'signature-request': 'Signature Request',
        'payment-confirmation': 'Payment Confirmation',
        'production': 'Production Order'
    };

    let content = '';
    if (emails.length === 0) {
        content = '<p style="color: #666; text-align: center; padding: 20px;">No emails sent yet for this quote.</p>';
    } else {
        emails.forEach(email => {
            const date = new Date(email.sentAt).toLocaleString();
            const type = typeLabels[email.type] || email.type || 'Email';
            const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
            const cc = email.cc && email.cc.length > 0 ? `<br><span style="color: #888;">CC: ${email.cc.join(', ')}</span>` : '';
            content += `
                <div style="padding: 12px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #004a95;">${type}</strong>
                        <span style="color: #888; font-size: 0.85rem;">${date}</span>
                    </div>
                    <div style="font-size: 0.9rem; margin-top: 4px;">
                        <strong>To:</strong> ${to}${cc}
                    </div>
                    <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">${email.subject || ''}</div>
                </div>
            `;
        });
    }

    const modal = document.createElement('div');
    modal.id = 'emailsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div style="background: white; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 16px 20px; border-bottom: 2px solid #004a95; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #004a95;">Sent Emails (${emails.length})</h3>
                <button onclick="document.getElementById('emailsModal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
            </div>
            <div style="overflow-y: auto; flex: 1;">${content}</div>
        </div>
    `;
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

/**
 * Refresh the inline email history in the quote summary.
 * Fetches sent emails for the current quote and renders them inline.
 */
async function refreshEmailHistory() {
    if (!currentQuoteId) return;

    const section = document.getElementById('emailHistorySection');
    const listEl = document.getElementById('emailHistoryList');
    const countEl = document.getElementById('emailHistoryCount');
    if (!section || !listEl) return;

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${currentQuoteId}/emails`);
        const result = await response.json();

        if (!response.ok || !result.success) return;

        const emails = result.emails || [];

        if (emails.length === 0) {
            section.style.display = 'none';
            return;
        }

        const typeLabels = {
            'quote': 'Quote Email',
            'signature-request': 'Signature Request',
            'signature-customer-confirmation': 'Signature Confirmation',
            'payment-confirmation': 'Payment Confirmation',
            'production': 'Production Order'
        };

        const typeColors = {
            'quote': '#0071bc',
            'signature-request': '#e67e22',
            'signature-customer-confirmation': '#28a745',
            'payment-confirmation': '#6f42c1',
            'production': '#dc3545'
        };

        let html = '';
        emails.forEach(email => {
            const date = new Date(email.sentAt).toLocaleString();
            const type = typeLabels[email.type] || email.type || 'Email';
            const color = typeColors[email.type] || '#666';
            const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem;">
                    <div>
                        <span style="font-weight: 600; color: ${color};">${type}</span>
                        <span style="color: #888;"> → ${to}</span>
                    </div>
                    <span style="color: #999; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">${date}</span>
                </div>
            `;
        });

        countEl.textContent = `(${emails.length})`;
        listEl.innerHTML = html;
        section.style.display = '';
    } catch (err) {
        console.error('Failed to load email history:', err);
    }
}

// ─── Data Mapping: currentOrderData → PDF template format ────────────────────
function mapOrderDataToTemplate(orderData) {
    // Guard: block PDF generation for incomplete quotes (exclude excluded screens from check)
    const unconfigured = (orderData.screens || []).filter(s => s.phase === 'opening' && !s.excluded);
    if (unconfigured.length > 0) {
        throw new Error(`Cannot generate PDF — ${unconfigured.length} opening(s) still need configuration.`);
    }

    const address = [
        orderData.streetAddress,
        orderData.aptSuite,
        [orderData.city, orderData.state, orderData.zipCode].filter(Boolean).join(', ')
    ].filter(Boolean).join(', ');

    const screens = (orderData.screens || []).filter(s => !s.excluded).map((screen, i) => ({
        name: screen.screenName || `Screen ${i + 1}`,
        track: getClientFacingTrackName(screen.trackTypeName),
        operator: getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName),
        fabric: screen.fabricColorName || '',
        frame: screen.frameColorName || '',
        width: screen.actualWidthDisplay || '',
        height: screen.actualHeightDisplay || '',
        price1: (screen.customerPrice || 0) - (screen.installationPrice || 0) - (screen.wiringPrice || 0),
        price2: screen.comparisonMaterialPrice != null ? screen.comparisonMaterialPrice : null
    }));

    const materialsPrice = orderData.orderTotalMaterialsPrice || 0;
    const installationPrice = orderData.orderTotalInstallationPrice || 0;
    const wiringPrice = orderData.orderTotalWiringPrice || 0;
    const miscInstallAmount = orderData.miscInstallAmount || 0;
    const discountPercent = orderData.discountPercent || 0;
    const discountAmount = orderData.discountAmount || 0;
    const subtotal = (discountPercent > 0 ? orderData.discountedMaterialsPrice : materialsPrice) + installationPrice + wiringPrice + miscInstallAmount;
    const total = orderData.orderTotalPrice || 0;

    const data = {
        customer: {
            name: orderData.customerName || '',
            company: orderData.companyName || undefined,
            address: address,
            email: orderData.customerEmail || '',
            phone: orderData.customerPhone || ''
        },
        salesRep: {
            name: orderData.salesRepName || '',
            email: orderData.salesRepEmail || '',
            phone: orderData.salesRepPhone || ''
        },
        quote: {
            number: orderData.quoteNumber || 'DRAFT',
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            validThrough: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        },
        signingUrl: orderData.id
            ? `https://rollashield.github.io/screen-quote-tool/sign.html?quoteId=${orderData.id}&mode=in-person`
            : null,
        screens: screens,
        projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0).map(acc => ({
            name: acc.name,
            quantity: acc.quantity,
            unitPrice: acc.customerPrice,
            lineTotal: acc.customerPrice * acc.quantity
        })),
        pricing: {
            materials: materialsPrice,
            installation: installationPrice,
            wiring: wiringPrice,
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: miscInstallAmount,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            subtotal: subtotal,
            tax: 0,
            total: total,
            deposit: total / 2,
            balance: total / 2,
            guaranteeDiscount: orderData.totalGuaranteeDiscount || 0,
            fourWeekGuarantee: orderData.fourWeekGuarantee || false
        },
        comparisonPricing: null
    };

    // Build comparison pricing if enabled
    if (orderData.enableComparison) {
        const compMaterials = orderData.comparisonTotalMaterialsPrice || 0;
        const compDiscounted = orderData.comparisonDiscountedMaterialsPrice || compMaterials;
        const compSubtotal = (discountPercent > 0 ? compDiscounted : compMaterials) + installationPrice + wiringPrice + miscInstallAmount;
        const compTotal = orderData.comparisonTotalPrice || 0;

        // Get comparison labels based on type (motor or track)
        const firstScreen = (orderData.screens || []).find(s => !s.excluded);
        let option1Label, option2Label;
        if (orderData.comparisonType === 'track') {
            option1Label = firstScreen
                ? getClientFacingTrackName(firstScreen.trackTypeName)
                : 'Option 1';
            option2Label = orderData.comparisonTrack
                ? getTrackTypeName(orderData.comparisonTrack).replace(' Track', '')
                : 'Option 2';
        } else {
            option1Label = firstScreen
                ? getClientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName)
                : 'Option 1';
            option2Label = orderData.comparisonMotor
                ? getClientFacingOperatorName(orderData.comparisonMotor, orderData.comparisonMotor)
                : 'Option 2';
        }

        data.comparisonPricing = {
            option1Label: option1Label,
            option2Label: option2Label,
            materials2: compMaterials,
            discountAmount2: discountPercent > 0 ? compMaterials - compDiscounted : 0,
            subtotal2: compSubtotal,
            total2: compTotal,
            deposit2: compTotal / 2,
            balance2: compTotal / 2
        };
    }

    return data;
}

async function generatePDF() {
    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary.classList.contains('hidden')) {
        alert('Please calculate a quote first');
        return;
    }

    // Fallback if pdfmake not loaded
    if (typeof pdfMake === 'undefined' || typeof generateQuotePDF === 'undefined') {
        console.warn('pdfMake or pdf-template not loaded, falling back to window.print()');
        const internalInfo = document.querySelector('.internal-info');
        const buttonGroup = document.querySelector('.button-group');
        internalInfo.style.display = 'none';
        buttonGroup.style.display = 'none';
        window.print();
        setTimeout(() => {
            internalInfo.style.display = 'block';
            buttonGroup.style.display = 'flex';
        }, 1000);
        return;
    }

    const pdfBtn = document.querySelector('button[onclick="generatePDF()"]');
    if (pdfBtn) {
        pdfBtn.disabled = true;
        pdfBtn.textContent = 'Generating...';
    }

    try {
        const pdfBlob = await generatePdfBlob();
        const quoteNum = window.currentOrderData.quoteNumber || 'DRAFT';
        const customerName = (window.currentOrderData.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
        const filename = `RAS-Quote-${quoteNum}-${customerName}.pdf`;

        const blobUrl = URL.createObjectURL(pdfBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = blobUrl;
        downloadLink.download = filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Falling back to print view.');
        window.print();
    } finally {
        if (pdfBtn) {
            pdfBtn.disabled = false;
            pdfBtn.textContent = 'Download PDF';
        }
    }
}

/**
 * Generate PDF blob from current order data.
 * Reusable helper — used by generatePDF() for download and sendQuoteForSignature() for email attachment.
 */
async function generatePdfBlob() {
    const templateData = mapOrderDataToTemplate(window.currentOrderData);
    const docDefinition = generateQuotePDF(templateData);

    return new Promise((resolve, reject) => {
        try {
            pdfMake.createPdf(docDefinition).getBlob(blob => {
                resolve(blob);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Combined action: send quote PDF + signing link in one email.
 * Replaces separate "Email Quote" and "Send for Signature" buttons.
 */
async function sendQuoteForSignature() {
    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first before sending.');
        return;
    }

    const customerEmail = window.currentOrderData.customerEmail || document.getElementById('customerEmail')?.value;
    if (!customerEmail) {
        alert('Please enter a customer email address before sending.');
        return;
    }

    if (!confirm(`Send quote PDF and signing link to ${customerEmail}?`)) {
        return;
    }

    const btn = document.querySelector('button[onclick="sendQuoteForSignature()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving & Generating PDF...';
    }

    try {
        // 1. Save quote first
        const saved = await ensureQuoteSaved();
        if (!saved) {
            if (btn) { btn.disabled = false; btn.textContent = 'Send Quote & Request Signature'; }
            return;
        }

        // 2. Generate PDF blob and convert to base64
        if (btn) btn.textContent = 'Generating PDF...';

        if (typeof pdfMake === 'undefined' || typeof generateQuotePDF === 'undefined') {
            alert('PDF generation not available. Please reload the page and try again.');
            if (btn) { btn.disabled = false; btn.textContent = 'Send Quote & Request Signature'; }
            return;
        }

        const pdfBlob = await generatePdfBlob();
        const pdfBase64 = await blobToBase64(pdfBlob);

        const quoteNum = window.currentOrderData.quoteNumber || 'DRAFT';
        const customerName = (window.currentOrderData.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
        const pdfFilename = `RAS-Quote-${quoteNum}-${customerName}.pdf`;

        // 3. Send to worker with PDF attachment
        if (btn) btn.textContent = 'Sending...';

        const response = await fetch(`${WORKER_URL}/api/quote/${window.currentOrderData.id}/send-for-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64, pdfFilename })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            alert(`Quote PDF and signing link sent to ${customerEmail}!`);
            // Show checkmark on button to reflect it's been sent
            if (btn) {
                btn.innerHTML = '✓ Quote Sent & Signature Requested';
                btn.style.background = '#28a745';
                btn.disabled = true;
            }
            // Refresh email history if visible (function created in Phase 7.6)
            if (currentQuoteId && typeof refreshEmailHistory === 'function') refreshEmailHistory();
            return; // Skip finally block's reset
        } else {
            alert('Failed to send: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending quote for signature:', error);
        alert('Failed to send. Please check your internet connection.');
    }
    // Only restore button if send failed (success returns early above)
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Quote & Request Signature';
    }
}

// ─── Signature Functions ─────────────────────────────────────────────────────

/**
 * Ensure the current quote is saved to D1 before navigating away.
 * If already saved (has a quote_number from D1), does nothing.
 * Returns true if save succeeded, false otherwise.
 */
/**
 * Auto-save the current quote silently after calculate.
 * Shows a brief "Saved ✓" indicator on success.
 */
async function autoSaveQuote() {
    if (!window.currentOrderData) return;
    try {
        await saveQuote();
        // Show brief saved indicator
        const indicator = document.getElementById('autoSaveQuoteIndicator');
        if (indicator) {
            indicator.style.display = '';
            setTimeout(() => { indicator.style.display = 'none'; }, 2500);
        }
    } catch (err) {
        console.error('Auto-save failed:', err);
        // Silent failure — user can still manually trigger save actions
    }
}

async function ensureQuoteSaved() {
    const orderData = window.currentOrderData;
    if (!orderData) return false;

    // Read fresh internal comments
    const internalComments = document.getElementById('internalComments')?.value || '';
    orderData.internalComments = internalComments;

    // Upload any pending photos for each screen
    const quoteId = orderData.id.toString();
    for (let i = 0; i < orderData.screens.length; i++) {
        const screen = orderData.screens[i];
        if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
            const uploaded = await uploadPendingPhotos(quoteId, i, screen.pendingPhotos);
            screen.photos = (screen.photos || []).concat(uploaded);
            screen.pendingPhotos = [];
        }
    }

    // Delete any photos that were removed
    await deleteMarkedPhotos();

    // Strip File/Blob objects before serialization (they can't be JSON-stringified)
    const screensForSave = orderData.screens.map(s => {
        const { pendingPhotos, ...rest } = s;
        return rest;
    });

    const response = await fetch(`${WORKER_URL}/api/save-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: orderData.id.toString(),
            customerName: orderData.customerName,
            companyName: orderData.companyName || '',
            customerEmail: orderData.customerEmail || '',
            customerPhone: orderData.customerPhone || '',
            streetAddress: orderData.streetAddress || '',
            aptSuite: orderData.aptSuite || '',
            nearestIntersection: orderData.nearestIntersection || '',
            city: orderData.city || '',
            state: orderData.state || '',
            zipCode: orderData.zipCode || '',
            screens: screensForSave,
            orderTotalPrice: orderData.orderTotalPrice,
            orderTotalMaterialsPrice: orderData.orderTotalMaterialsPrice,
            orderTotalInstallationPrice: orderData.orderTotalInstallationPrice,
            orderTotalInstallationCost: orderData.orderTotalInstallationCost,
            orderTotalCost: orderData.orderTotalCost,
            totalProfit: orderData.totalProfit,
            marginPercent: orderData.marginPercent,
            hasCableScreen: orderData.hasCableScreen,
            totalScreenCosts: orderData.totalScreenCosts,
            totalMotorCosts: orderData.totalMotorCosts,
            totalAccessoriesCosts: orderData.totalAccessoriesCosts,
            totalCableSurcharge: orderData.totalCableSurcharge,
            discountPercent: orderData.discountPercent,
            discountLabel: orderData.discountLabel,
            discountAmount: orderData.discountAmount,
            discountedMaterialsPrice: orderData.discountedMaterialsPrice,
            enableComparison: orderData.enableComparison,
            comparisonType: orderData.comparisonType || 'motor',
            comparisonMotor: orderData.comparisonMotor,
            comparisonTrack: orderData.comparisonTrack || '',
            comparisonSkippedCount: orderData.comparisonSkippedCount || 0,
            comparisonTotalMaterialsPrice: orderData.comparisonTotalMaterialsPrice,
            comparisonDiscountedMaterialsPrice: orderData.comparisonDiscountedMaterialsPrice,
            comparisonTotalPrice: orderData.comparisonTotalPrice,
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: orderData.miscInstallAmount || 0,
            miscInstallCost: orderData.miscInstallCost || 0,
            projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
            projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
            projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            airtableOpportunityName: orderData.airtableOpportunityName || '',
            internalComments: internalComments,
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || '',
            fourWeekGuarantee: orderData.fourWeekGuarantee || false,
            totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0
        })
    });

    const result = await response.json();

    if (response.ok && result.success) {
        return true;
    } else {
        alert('Failed to save quote: ' + (result.error || 'Unknown error'));
        return false;
    }
}

async function presentForSignature() {
    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first before presenting for signature.');
        return;
    }

    const btn = document.querySelector('button[onclick="presentForSignature()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
        const saved = await ensureQuoteSaved();
        if (!saved) {
            if (btn) { btn.disabled = false; btn.textContent = 'Present for Signature'; }
            return;
        }
        window.location.href = `sign.html?quoteId=${window.currentOrderData.id}&mode=in-person`;
    } catch (error) {
        console.error('Error saving quote for signature:', error);
        alert('Failed to save quote. Please check your internet connection.\n\nError: ' + error.message);
        if (btn) { btn.disabled = false; btn.textContent = 'Present for Signature'; }
    }
}

async function sendForSignature() {
    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first before sending for signature.');
        return;
    }

    const customerEmail = window.currentOrderData.customerEmail || document.getElementById('customerEmail')?.value;
    if (!customerEmail) {
        alert('Please enter a customer email address before sending for signature.');
        return;
    }

    if (!confirm(`Send signing link to ${customerEmail}?`)) {
        return;
    }

    const btn = document.querySelector('button[onclick="sendForSignature()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving & Sending...';
    }

    try {
        const saved = await ensureQuoteSaved();
        if (!saved) {
            if (btn) { btn.disabled = false; btn.textContent = 'Send for Signature'; }
            return;
        }

        const response = await fetch(`${WORKER_URL}/api/quote/${window.currentOrderData.id}/send-for-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        const result = await response.json();

        if (response.ok && result.success) {
            alert(`Signing link sent to ${customerEmail}!`);
        } else {
            alert('Failed to send signing link: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending for signature:', error);
        alert('Failed to send signing link. Please check your internet connection.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Send for Signature';
        }
    }
}

async function finalizeProjectDetails() {
    if (isSaving) return;

    // Check if order has been calculated
    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate an order quote first before finalizing project details.');
        return;
    }

    isSaving = true;
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (finalizeBtn) finalizeBtn.disabled = true;

    const orderData = window.currentOrderData;
    const orderId = orderData.id || Date.now();

    // Upload pending photos and clean up deletions before saving
    try {
        for (let i = 0; i < orderData.screens.length; i++) {
            const screen = orderData.screens[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(orderId.toString(), i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }
        await deleteMarkedPhotos();
    } catch (photoErr) {
        console.error('Photo processing error:', photoErr);
    }

    // Strip Blob objects before serialization
    const screensForFinalize = orderData.screens.map(s => {
        const { pendingPhotos, ...rest } = s;
        return rest;
    });

    // Save the quote to D1 before navigating
    try {
        const response = await fetch(`${WORKER_URL}/api/save-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: orderId.toString(),
                customerName: orderData.customerName,
                companyName: orderData.companyName || '',
                customerEmail: orderData.customerEmail || '',
                customerPhone: orderData.customerPhone || '',
                streetAddress: orderData.streetAddress || '',
                aptSuite: orderData.aptSuite || '',
                nearestIntersection: orderData.nearestIntersection || '',
                city: orderData.city || '',
                state: orderData.state || '',
                zipCode: orderData.zipCode || '',
                screens: screensForFinalize,
                orderTotalPrice: orderData.orderTotalPrice,
                orderTotalMaterialsPrice: orderData.orderTotalMaterialsPrice,
                orderTotalInstallationPrice: orderData.orderTotalInstallationPrice,
                orderTotalInstallationCost: orderData.orderTotalInstallationCost,
                orderTotalCost: orderData.orderTotalCost,
                totalProfit: orderData.totalProfit,
                marginPercent: orderData.marginPercent,
                hasCableScreen: orderData.hasCableScreen,
                totalScreenCosts: orderData.totalScreenCosts,
                totalMotorCosts: orderData.totalMotorCosts,
                totalAccessoriesCosts: orderData.totalAccessoriesCosts,
                totalCableSurcharge: orderData.totalCableSurcharge,
                discountPercent: orderData.discountPercent,
                discountLabel: orderData.discountLabel,
                discountAmount: orderData.discountAmount,
                discountedMaterialsPrice: orderData.discountedMaterialsPrice,
                enableComparison: orderData.enableComparison,
                comparisonMotor: orderData.comparisonMotor,
                comparisonTotalMaterialsPrice: orderData.comparisonTotalMaterialsPrice,
                comparisonDiscountedMaterialsPrice: orderData.comparisonDiscountedMaterialsPrice,
                comparisonTotalPrice: orderData.comparisonTotalPrice,
                miscInstallLabel: orderData.miscInstallLabel || '',
                miscInstallAmount: orderData.miscInstallAmount || 0,
                miscInstallCost: orderData.miscInstallCost || 0,
                projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
                projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
                projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
                // Airtable integration fields
                airtableOpportunityId: orderData.airtableOpportunityId || '',
                airtableContactId: orderData.airtableContactId || '',
                airtableOpportunityName: orderData.airtableOpportunityName || '',
                internalComments: document.getElementById('internalComments')?.value || '',
                fourWeekGuarantee: orderData.fourWeekGuarantee || false,
                totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Navigate to finalize page with orderId
            window.location.href = `finalize.html?orderId=${orderId}`;
        } else {
            alert('Failed to save quote before finalizing: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving quote for finalize:', error);
        alert('Failed to save quote. Please check your internet connection.\n\nError: ' + error.message);
    } finally {
        isSaving = false;
        if (finalizeBtn) finalizeBtn.disabled = false;
    }
}


function resetForm() {
    if (!confirm('Are you sure you want to clear the form?')) return;

    document.getElementById('screenName').value = '';
    document.getElementById('customerName').value = '';
    document.getElementById('companyName').value = '';
    document.getElementById('customerEmail').value = '';
    document.getElementById('customerPhone').value = '';
    document.getElementById('streetAddress').value = '';
    document.getElementById('aptSuite').value = '';
    document.getElementById('nearestIntersection').value = '';
    document.getElementById('city').value = '';
    document.getElementById('state').value = '';
    document.getElementById('zipCode').value = '';
    document.getElementById('trackType').value = '';
    document.getElementById('operatorType').value = '';
    document.getElementById('operatorType').disabled = true;
    document.getElementById('fabricColor').value = '';
    document.getElementById('frameColor').value = '';
    document.getElementById('widthInches').value = '';
    document.getElementById('widthFraction').value = '';
    document.getElementById('heightInches').value = '';
    document.getElementById('heightFraction').value = '';
    document.getElementById('noTracks').checked = false;
    document.getElementById('includeInstallation').checked = true;
    document.getElementById('dimensionsSummary').style.display = 'none';
    document.getElementById('enableComparison').checked = false;
    document.getElementById('comparisonOptions').style.display = 'none';
    document.getElementById('comparisonMotor').value = '';
    document.getElementById('comparisonTrack').value = '';
    const compMotorRadio = document.querySelector('input[name="comparisonType"][value="motor"]');
    if (compMotorRadio) compMotorRadio.checked = true;
    updateComparisonUI();
    const compWarningEl = document.getElementById('comparisonTrackWarning');
    if (compWarningEl) compWarningEl.style.display = 'none';
    document.getElementById('discountLabel').value = '';
    document.getElementById('discountPercent').value = '0';
    document.getElementById('miscInstallLabel').value = '';
    document.getElementById('miscInstallAmount').value = '';
    updateAccessories();
    editingScreenIndex = null;
    screensInOrder = [];

    // Clear project accessories
    projectAccessories = [];
    document.getElementById('projectAccessoriesSection').style.display = 'none';
    document.getElementById('projectAccessoriesList').style.display = 'none';
    document.getElementById('toggleProjectAccBtn').textContent = 'Add Project Accessories';

    // Clear Airtable state
    document.getElementById('airtableOpportunityId').value = '';
    document.getElementById('airtableContactId').value = '';
    document.getElementById('opportunitySearch').value = '';
    document.getElementById('opportunitySearchResults').style.display = 'none';
    const banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.add('hidden');
    banner.style.display = 'none';

    // Clear internal comments
    const commentsEl = document.getElementById('internalComments');
    if (commentsEl) commentsEl.value = '';

    // Reset Phase 2 visibility and buttons
    updatePhase2Visibility();
    updateAddToOrderButton();

    // Clear photos
    pendingScreenPhotos = [];
    existingScreenPhotos = [];
    renderPhotoPreview();

    // Clear guarantee and hide its section
    document.getElementById('fourWeekGuarantee').checked = false;
    const guaranteeSec = document.getElementById('guaranteeSection');
    if (guaranteeSec) guaranteeSec.style.display = 'none';

    // Hide screens section and quote summary
    document.getElementById('screensInOrder').classList.add('hidden');
    document.getElementById('quoteSummary').classList.add('hidden');

    // Reset Phase 1 header to "Document Opening #1"
    editingScreenIndex = null;
    updatePhase1Header();

    // Reset quote and entity IDs so next save creates new records
    currentQuoteId = null;
    currentContactId = null;
    currentPropertyId = null;
}

// Multi-screen order functions

// ─── Phase 1: Add Opening (dimensions + metadata only) ─────────────────────
function addOpening() {
    // Read Phase 1 fields
    const widthInchesRaw = document.getElementById('widthInches').value;
    const widthFractionRaw = document.getElementById('widthFraction').value;
    const heightInchesRaw = document.getElementById('heightInches').value;
    const heightFractionRaw = document.getElementById('heightFraction').value;

    const widthInches = parseFloat(widthInchesRaw) || 0;
    const widthFraction = parseFraction(widthFractionRaw);
    const heightInches = parseFloat(heightInchesRaw) || 0;
    const heightFraction = parseFraction(heightFractionRaw);
    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;

    if (totalWidthInches === 0 || totalHeightInches === 0) {
        alert('Please enter valid opening dimensions');
        return;
    }

    // Check for dimension warning
    const dimensionWarning = document.getElementById('dimensionWarning');
    if (dimensionWarning && dimensionWarning.style.display !== 'none') {
        alert('Cannot add opening — dimensions exceed limits. Please adjust dimensions.');
        return;
    }

    const width = Math.round(totalWidthInches / 12);
    const height = Math.round(totalHeightInches / 12);

    const opening = {
        phase: 'opening',
        screenName: document.getElementById('screenName').value.trim() || null,
        totalWidthInches, totalHeightInches,
        width, height,
        widthInputValue: widthInchesRaw,
        widthFractionValue: widthFractionRaw,
        heightInputValue: heightInchesRaw,
        heightFractionValue: heightFractionRaw,
        actualWidthDisplay: inchesToFeetAndInches(totalWidthInches),
        actualHeightDisplay: inchesToFeetAndInches(totalHeightInches),
        frameColor: '',
        frameColorName: '',
        includeInstallation: document.getElementById('includeInstallation').checked,
        wiringDistance: parseInt(document.getElementById('wiringDistance').value) || 0,
        photos: existingScreenPhotos.slice(),
        pendingPhotos: pendingScreenPhotos.slice(),
        // Quick config preferences (override project defaults during batch apply)
        preferredTrackType: document.getElementById('prefTrackType').value || '',
        preferredOperator: document.getElementById('prefOperator').value || '',
        preferredFabric: document.getElementById('prefFabric').value || '',
        preferredFrameColor: document.getElementById('prefFrameColor').value || ''
    };

    const wasEditing = editingScreenIndex !== null;
    const editedIndex = editingScreenIndex; // Capture before clearing

    if (wasEditing) {
        const existingScreen = screensInOrder[editingScreenIndex];
        if (existingScreen.phase === 'configured') {
            // Check if dimensions changed (rounded feet differ)
            if (existingScreen.width !== width || existingScreen.height !== height) {
                // Dimensions changed — reset to opening (pricing bracket may differ)
                screensInOrder[editingScreenIndex] = opening;
            } else {
                // Dimensions same — merge Phase 1 updates into configured screen
                existingScreen.screenName = opening.screenName;
                existingScreen.totalWidthInches = opening.totalWidthInches;
                existingScreen.totalHeightInches = opening.totalHeightInches;
                existingScreen.widthInputValue = opening.widthInputValue;
                existingScreen.widthFractionValue = opening.widthFractionValue;
                existingScreen.heightInputValue = opening.heightInputValue;
                existingScreen.heightFractionValue = opening.heightFractionValue;
                existingScreen.actualWidthDisplay = opening.actualWidthDisplay;
                existingScreen.actualHeightDisplay = opening.actualHeightDisplay;
                // frameColor preserved from Phase 2 configuration (not changed in Phase 1)
                existingScreen.includeInstallation = opening.includeInstallation;
                existingScreen.wiringDistance = opening.wiringDistance;
                existingScreen.photos = opening.photos;
                existingScreen.pendingPhotos = opening.pendingPhotos;
            }
        } else {
            // Editing an opening — replace it
            screensInOrder[editingScreenIndex] = opening;
        }
        editingScreenIndex = null;
    } else {
        screensInOrder.push(opening);
    }

    resetFormForNextOpening();
    updateAddToOrderButton();
    renderScreensList();
    updatePhase1Header();
    if (!wasEditing) scrollToLastCard();

    document.getElementById('screensInOrder').classList.remove('hidden');
    document.getElementById('quoteSummary').classList.add('hidden');

    // Auto-save the opening to D1 if quote has been saved before
    autoSaveOpening(wasEditing ? editedIndex : screensInOrder.length - 1);
}

// ─── Add to Order (single-pass: all fields filled) ─────────────────────────
function addToOrder() {
    // Calculate screen data (requires Phase 2 fields: track, operator, fabric)
    const screenData = calculateScreenData();
    if (!screenData) return; // Validation failed

    const wasEditing = editingScreenIndex !== null;

    if (wasEditing) {
        // Update existing screen
        screensInOrder[editingScreenIndex] = screenData;
        editingScreenIndex = null;
    } else {
        // Add new screen
        screensInOrder.push(screenData);
    }

    // Clear form for next screen
    resetFormForNextScreen();

    // Reset button text
    updateAddToOrderButton();

    // Update screen list display
    renderScreensList();
    updatePhase1Header();
    if (!wasEditing) scrollToLastCard();

    // Show screens section and hide quote
    document.getElementById('screensInOrder').classList.remove('hidden');
    document.getElementById('quoteSummary').classList.add('hidden');
}

// ─── Photo Management ────────────────────────────────────────────────────────
// Functions moved to photo-manager.js:
//   compressPhoto, handlePhotoSelect, renderPhotoPreview,
//   removePendingPhoto, removeExistingPhoto, uploadPendingPhotos, deleteMarkedPhotos

function toggleExclude(index) {
    const screen = screensInOrder[index];
    if (!screen) return;
    screen.excluded = !screen.excluded;
    renderScreensList();
    // If quote summary is visible, recalculate
    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary && !quoteSummary.classList.contains('hidden')) {
        calculateOrderQuote();
    }
}

function updateMaxWidthHelp() {
    const helpDiv = document.getElementById('maxWidthHelp');
    if (!helpDiv) return;
    helpDiv.textContent = "Max widths: Zipper 24', Cable 22', Keder 20'";
}

function updateDropdownCompatibility() {
    const widthInches = parseFloat(document.getElementById('widthInches').value) || 0;
    const widthFraction = parseFraction(document.getElementById('widthFraction').value);
    const heightInches = parseFloat(document.getElementById('heightInches').value) || 0;
    const heightFraction = parseFraction(document.getElementById('heightFraction').value);
    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;
    const widthFt = Math.round(totalWidthInches / 12);
    const heightFt = Math.round(totalHeightInches / 12);

    const trackSelects = ['trackType', 'defaultTrackType', 'prefTrackType'];
    const trackOptions = getTrackTypeOptions();

    trackSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        select.querySelectorAll('option').forEach(opt => {
            if (!opt.value) return; // Skip placeholder

            // Restore original label
            if (!opt.dataset.originalText) opt.dataset.originalText = opt.textContent;

            if (totalWidthInches === 0 && totalHeightInches === 0) {
                opt.disabled = false;
                opt.textContent = opt.dataset.originalText;
                return;
            }

            const priceData = getPricingTable(opt.value);
            if (!priceData) return;

            const maxWidth = Math.max(...Object.keys(priceData).map(Number));
            if (widthFt > maxWidth) {
                opt.disabled = true;
                opt.textContent = `${opt.dataset.originalText} (max ${maxWidth}ft W)`;
            } else if (widthFt > 0 && priceData[String(widthFt)]) {
                const maxHeight = getMaxHeightForWidth(priceData, String(widthFt));
                if (heightFt > maxHeight && totalHeightInches > 0) {
                    opt.disabled = true;
                    opt.textContent = `${opt.dataset.originalText} (max ${maxHeight}ft H at ${widthFt}ft W)`;
                } else {
                    opt.disabled = false;
                    opt.textContent = opt.dataset.originalText;
                }
            } else {
                opt.disabled = false;
                opt.textContent = opt.dataset.originalText;
            }
        });
    });
}

function checkDimensionLimits() {
    const warningDiv = document.getElementById('dimensionWarning');
    const warningText = document.getElementById('dimensionWarningText');
    const addBtn = document.getElementById('addToOrderBtn');
    const trackType = document.getElementById('trackType').value;

    // Clear warning if no track type selected
    const priceData = getPricingTable(trackType);
    if (!priceData) {
        warningDiv.style.display = 'none';
        if (addBtn) addBtn.disabled = false;
        return;
    }

    const widthInches = parseFloat(document.getElementById('widthInches').value) || 0;
    const widthFraction = parseFraction(document.getElementById('widthFraction').value);
    const heightInches = parseFloat(document.getElementById('heightInches').value) || 0;
    const heightFraction = parseFraction(document.getElementById('heightFraction').value);

    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;

    // Don't show warnings if no dimensions entered yet
    if (totalWidthInches === 0 && totalHeightInches === 0) {
        warningDiv.style.display = 'none';
        if (addBtn) addBtn.disabled = false;
        return;
    }

    const width = Math.round(totalWidthInches / 12);
    const height = Math.round(totalHeightInches / 12);

    const trackName = document.getElementById('trackType').selectedOptions[0]?.text || 'selected track';
    const maxWidth = Math.max(...Object.keys(priceData).map(Number));
    const messages = [];

    if (width > maxWidth) {
        messages.push(`Width (${width} ft) exceeds maximum of ${maxWidth} ft for ${trackName}.`);
    } else if (width > 0 && priceData[String(width)]) {
        const maxHeight = getMaxHeightForWidth(priceData, String(width));
        if (height > maxHeight && totalHeightInches > 0) {
            messages.push(`Height (${height} ft) exceeds maximum of ${maxHeight} ft for ${trackName} at ${width} ft width.`);
        }
    } else if (width > 0 && !priceData[String(width)]) {
        // Width exists but below minimum (unlikely but handle)
        const minWidth = Math.min(...Object.keys(priceData).map(Number));
        messages.push(`Width (${width} ft) is below minimum of ${minWidth} ft for ${trackName}.`);
    }

    if (messages.length > 0) {
        warningText.innerHTML = messages.join('<br>');
        warningDiv.style.display = 'block';
        if (addBtn) addBtn.disabled = true;
    } else {
        warningDiv.style.display = 'none';
        if (addBtn) addBtn.disabled = false;
    }
}

// ── Project Accessories (A La Carte) ──

function getApplicableProjectAccessories() {
    // Scan screens for motor brands present
    const motorBrands = new Set();
    let hasSolar = false;
    screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-rts' || screen.operatorType === 'gaposa-solar') {
            motorBrands.add('gaposa');
        }
        if (screen.operatorType === 'somfy-rts') {
            motorBrands.add('somfy');
        }
        if (screen.operatorType === 'gaposa-solar') {
            hasSolar = true;
        }
    });

    const items = [];
    motorBrands.forEach(brand => {
        let brandAccessories = accessories[brand] || [];
        brandAccessories.forEach(acc => {
            // Filter extension cord: only show if solar motor present
            if (acc.id === 'gaposa-solar-ext' && !hasSolar) return;
            items.push({ ...acc, brand });
        });
    });
    return items;
}

function renderProjectAccessories() {
    const listEl = document.getElementById('projectAccessoriesList');
    const available = getApplicableProjectAccessories();

    if (available.length === 0) {
        listEl.innerHTML = '<p style="color: #666; font-size: 0.85rem;">No motorized screens in order. Add screens with motors to see available accessories.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    available.forEach(acc => {
        // Calculate customer price (same markup logic as per-screen)
        let customerPrice;
        if (acc.markup) {
            customerPrice = acc.cost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
        } else {
            customerPrice = acc.cost;
        }

        // Find existing quantity from projectAccessories
        const existing = projectAccessories.find(pa => pa.id === acc.id);
        const qty = existing ? existing.quantity : 0;
        const lineTotal = customerPrice * qty;

        html += `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #f8f9fa; border-radius: 4px; flex-wrap: wrap;">
                <span style="flex: 1; min-width: 180px; font-size: 0.9rem;">${acc.name}</span>
                <span style="color: #666; font-size: 0.85rem; min-width: 80px; text-align: right;">$${customerPrice.toFixed(2)} ea</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button type="button" onclick="updateProjectAccessoryQuantity('${acc.id}', ${qty - 1})"
                            style="width: 28px; height: 28px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 1rem; line-height: 1;"
                            ${qty <= 0 ? 'disabled' : ''}>−</button>
                    <span style="width: 28px; text-align: center; font-weight: 600; font-size: 0.9rem;">${qty}</span>
                    <button type="button" onclick="updateProjectAccessoryQuantity('${acc.id}', ${qty + 1})"
                            style="width: 28px; height: 28px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 1rem; line-height: 1;"
                            ${qty >= 10 ? 'disabled' : ''}>+</button>
                </div>
                <span style="min-width: 80px; text-align: right; font-weight: 600; font-size: 0.9rem; color: ${lineTotal > 0 ? '#0056A3' : '#999'};">
                    ${lineTotal > 0 ? '$' + lineTotal.toFixed(2) : '—'}
                </span>
            </div>
        `;
    });
    html += '</div>';
    listEl.innerHTML = html;
}

function toggleProjectAccessories() {
    const listEl = document.getElementById('projectAccessoriesList');
    const btn = document.getElementById('toggleProjectAccBtn');
    if (listEl.style.display === 'none') {
        listEl.style.display = 'block';
        btn.textContent = 'Hide Project Accessories';
        renderProjectAccessories();
    } else {
        listEl.style.display = 'none';
        btn.textContent = 'Add Project Accessories';
    }
}

function updateProjectAccessoryQuantity(accId, newQty) {
    if (newQty < 0) newQty = 0;
    if (newQty > 10) newQty = 10;

    const available = getApplicableProjectAccessories();
    const accDef = available.find(a => a.id === accId);
    if (!accDef) return;

    // Calculate customer price
    let customerPrice;
    if (accDef.markup) {
        customerPrice = accDef.cost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
    } else {
        customerPrice = accDef.cost;
    }

    // Update or add/remove from projectAccessories array
    const idx = projectAccessories.findIndex(pa => pa.id === accId);
    if (newQty === 0) {
        if (idx >= 0) projectAccessories.splice(idx, 1);
    } else {
        const entry = {
            id: accDef.id,
            name: accDef.name,
            cost: accDef.cost,
            markup: accDef.markup,
            quantity: newQty,
            customerPrice: customerPrice
        };
        if (idx >= 0) {
            projectAccessories[idx] = entry;
        } else {
            projectAccessories.push(entry);
        }
    }

    renderProjectAccessories();
}

// ─── Pure pricing function (no DOM access) ─────────────────────────────────
// Called by calculateScreenData() and applyConfiguration() for batch pricing.
// All inputs passed as params object — never reads the DOM.
// ─── DOM wrapper: reads form fields, validates, then calls computeScreenPricing()
function calculateScreenData() {
    // Guard: if dimension warning is showing, block screen creation
    const dimensionWarning = document.getElementById('dimensionWarning');
    if (dimensionWarning && dimensionWarning.style.display !== 'none') {
        alert('Cannot add screen — dimensions exceed pricing limits. Please adjust dimensions.');
        return null;
    }

    // Get form values
    const trackType = document.getElementById('trackType').value;
    const operatorType = document.getElementById('operatorType').value;
    const fabricColor = document.getElementById('fabricColor').value;
    const frameColor = document.getElementById('frameColor').value;

    if (!trackType || !operatorType || !fabricColor || !frameColor) {
        alert('Please fill in all required fields (marked with *)');
        return null;
    }

    const widthInchesRaw = document.getElementById('widthInches').value;
    const widthFractionRaw = document.getElementById('widthFraction').value;
    const heightInchesRaw = document.getElementById('heightInches').value;
    const heightFractionRaw = document.getElementById('heightFraction').value;

    const widthInches = parseFloat(widthInchesRaw) || 0;
    const widthFraction = parseFraction(widthFractionRaw);
    const heightInches = parseFloat(heightInchesRaw) || 0;
    const heightFraction = parseFraction(heightFractionRaw);
    const totalWidthInches = widthInches + widthFraction;
    const totalHeightInches = heightInches + heightFraction;

    if (totalWidthInches === 0 || totalHeightInches === 0) {
        alert('Please enter valid screen dimensions');
        return null;
    }

    const width = Math.round(totalWidthInches / 12);
    const height = Math.round(totalHeightInches / 12);

    // Collect accessories from DOM
    const accessories = [];
    document.querySelectorAll('.accessory-item input[type="checkbox"]:checked').forEach(cb => {
        let accCost = parseFloat(cb.dataset.cost);
        const needsDiscount = cb.dataset.markup === 'true';
        if (needsDiscount) accCost = accCost * (1 - SUNAIR_DISCOUNT);
        accessories.push({ name: cb.dataset.name, cost: accCost, needsMarkup: needsDiscount });
    });

    const result = computeScreenPricing({
        screenName: document.getElementById('screenName').value.trim(),
        trackType,
        trackTypeName: document.getElementById('trackType').selectedOptions[0].text,
        operatorType,
        operatorTypeName: document.getElementById('operatorType').selectedOptions[0].text,
        fabricColor,
        fabricColorName: document.getElementById('fabricColor').selectedOptions[0].text,
        frameColor: document.getElementById('frameColor').value,
        frameColorName: document.getElementById('frameColor').selectedOptions[0]?.text || '',
        width, height,
        totalWidthInches, totalHeightInches,
        actualWidthDisplay: inchesToFeetAndInches(totalWidthInches),
        actualHeightDisplay: inchesToFeetAndInches(totalHeightInches),
        noTracks: document.getElementById('noTracks').checked,
        includeInstallation: document.getElementById('includeInstallation').checked,
        wiringDistance: document.getElementById('wiringDistance').value,
        accessories,
        guaranteeActive: document.getElementById('fourWeekGuarantee').checked,
        photos: existingScreenPhotos.slice(),
        pendingPhotos: pendingScreenPhotos.slice(),
        widthInputValue: widthInchesRaw,
        widthFractionValue: widthFractionRaw,
        heightInputValue: heightInchesRaw,
        heightFractionValue: heightFractionRaw
    });

    if (result.error) {
        alert(`Invalid screen dimensions. ${result.error}. Please check the size and try again.`);
        return null;
    }

    return result;
}

function resetFormForNextScreen() {
    document.getElementById('screenName').value = '';
    document.getElementById('widthInches').value = '';
    document.getElementById('widthFraction').value = '';
    document.getElementById('heightInches').value = '';
    document.getElementById('heightFraction').value = '';
    document.getElementById('wiringDistance').value = '';
    document.getElementById('wiringGroup').style.display = 'none';
    document.getElementById('dimensionsSummary').style.display = 'none';
    document.getElementById('dimensionWarning').style.display = 'none';
    document.getElementById('addToOrderBtn').disabled = false;

    // Copy selections from previous screen if available, otherwise reset everything
    if (screensInOrder.length > 0) {
        const lastScreen = screensInOrder[screensInOrder.length - 1];

        // Set track type and trigger change to populate dependent dropdowns
        document.getElementById('trackType').value = lastScreen.trackType;
        document.getElementById('trackType').dispatchEvent(new Event('change'));

        // Wait for operator dropdown to populate, then set remaining fields
        setTimeout(() => {
            document.getElementById('operatorType').value = lastScreen.operatorType;
            document.getElementById('operatorType').dispatchEvent(new Event('change'));
            document.getElementById('fabricColor').value = lastScreen.fabricColor;
            document.getElementById('frameColor').value = lastScreen.frameColor;
            document.getElementById('noTracks').checked = lastScreen.noTracks || false;
            document.getElementById('includeInstallation').checked =
                lastScreen.includeInstallation !== undefined ? lastScreen.includeInstallation : true;
            updateWiringVisibility();
            updateAccessories();
        }, 100);
    } else {
        document.getElementById('trackType').value = '';
        document.getElementById('operatorType').value = '';
        document.getElementById('operatorType').disabled = true;
        document.getElementById('fabricColor').value = '';
        document.getElementById('frameColor').value = '';
        document.getElementById('noTracks').checked = false;
        document.getElementById('includeInstallation').checked = true;
        updateAccessories();
    }

    // Clear photo state
    pendingScreenPhotos = [];
    existingScreenPhotos = [];
    renderPhotoPreview();
}

// ─── Reset form for next opening (Phase 1 only) ────────────────────────────
// Clears name, dimensions, photos. Does NOT touch Phase 2 fields.
// Copies frame color and installation from last opening.
function updatePhase1Header() {
    const headerEl = document.getElementById('phase1HeaderText');
    if (!headerEl) return;
    if (editingScreenIndex !== null) {
        const screen = screensInOrder[editingScreenIndex];
        const name = screen?.screenName || `Opening ${editingScreenIndex + 1}`;
        headerEl.textContent = `Editing: ${name}`;
    } else {
        const nextNum = screensInOrder.length + 1;
        headerEl.textContent = `Document Opening #${nextNum}`;
    }
}

function scrollToLastCard() {
    setTimeout(() => {
        const cards = document.querySelectorAll('#screensList .screen-card');
        if (cards.length > 0) {
            const lastCard = cards[cards.length - 1];
            lastCard.classList.add('screen-card-new');
            lastCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => lastCard.classList.remove('screen-card-new'), 1600);
        }
    }, 50);
}

function resetFormForNextOpening() {
    document.getElementById('screenName').value = '';
    document.getElementById('widthInches').value = '';
    document.getElementById('widthFraction').value = '';
    document.getElementById('heightInches').value = '';
    document.getElementById('heightFraction').value = '';
    document.getElementById('dimensionsSummary').style.display = 'none';
    document.getElementById('dimensionWarning').style.display = 'none';

    // Copy installation setting from last opening
    if (screensInOrder.length > 0) {
        const last = screensInOrder[screensInOrder.length - 1];
        document.getElementById('includeInstallation').checked =
            last.includeInstallation !== undefined ? last.includeInstallation : true;
    }

    // Clear wiring distance but respect installation checkbox
    document.getElementById('wiringDistance').value = '';
    updateWiringVisibility();

    // Clear photo state
    pendingScreenPhotos = [];
    existingScreenPhotos = [];
    renderPhotoPreview();

    // Clear quick config
    resetQuickConfig();
}

function renderScreensList() {
    const screensList = document.getElementById('screensList');
    const screenCount = document.getElementById('screenCount');
    const statusBar = document.getElementById('screenStatusBar');

    screenCount.textContent = screensInOrder.length;

    // Show/hide guarantee section based on whether any screens exist
    const guaranteeEl = document.getElementById('guaranteeSection');
    if (guaranteeEl) {
        guaranteeEl.style.display = screensInOrder.length > 0 ? '' : 'none';
    }

    if (screensInOrder.length === 0) {
        screensList.innerHTML = '<p>No screens added yet.</p>';
        statusBar.style.display = 'none';
        updatePhase2Visibility();
        return;
    }

    // Count phases
    const openingCount = screensInOrder.filter(s => s.phase === 'opening').length;
    const configuredCount = screensInOrder.filter(s => s.phase === 'configured').length;

    // Status bar
    if (openingCount > 0 || configuredCount > 0) {
        const parts = [`${screensInOrder.length} opening${screensInOrder.length !== 1 ? 's' : ''}`];
        if (configuredCount > 0) parts.push(`<strong style="color: #28a745;">${configuredCount} configured</strong>`);
        if (openingCount > 0) parts.push(`<strong style="color: #e67e22;">${openingCount} need${openingCount !== 1 ? '' : 's'} configuration</strong>`);
        statusBar.innerHTML = parts.join(' · ');
        statusBar.style.display = 'block';
    } else {
        statusBar.style.display = 'none';
    }

    let html = '';
    screensInOrder.forEach((screen, index) => {
        const displayName = screen.screenName || `Opening ${index + 1}`;
        const isEditing = editingScreenIndex === index;
        const photoCount = (screen.photos || []).length + (screen.pendingPhotos || []).length;

        if (screen.phase === 'opening') {
            // ─── Opening card (amber/dashed, no pricing) ───
            html += `
                <div class="screen-card ${isEditing ? 'editing' : ''}" style="border: 2px dashed #e67e22; background: #fef9f3;">
                    <div class="screen-card-header">
                        <h4>
                            <span style="background: #e67e22; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-right: 6px;">OPENING</span>
                            ${displayName}${isEditing ? ' <span style="color: #007bff;">(Editing...)</span>' : ''}
                        </h4>
                        <div class="screen-card-actions">
                            <button class="btn-edit" onclick="configureOpening(${index})" style="background: #004a95; color: white;">Configure</button>
                            <button class="btn-edit" onclick="editScreen(${index})">${isEditing ? 'Editing ↑' : 'Edit'}</button>
                            <button class="btn-remove" onclick="removeScreen(${index})">Remove</button>
                        </div>
                    </div>
                    <div class="screen-card-details">
                        <strong>Size:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H
                        <br>
                        ${screen.includeInstallation ? '<strong>Installation:</strong> Included' : '<strong>Installation:</strong> Not included'}
                        ${screen.wiringDistance > 0 ? ` | <strong>Wiring:</strong> ${screen.wiringDistance}"` : ''}
                        ${photoCount > 0 ? ` | <strong>Photos:</strong> ${photoCount}` : ''}
                        ${(screen.preferredTrackType || screen.preferredOperator || screen.preferredFabric || screen.preferredFrameColor) ? `<br><span style="color: #e67e22; font-size: 0.8rem;"><strong>Pref:</strong> ${[screen.preferredTrackType ? getTrackTypeName(screen.preferredTrackType) : '', screen.preferredOperator ? getOperatorTypeName(screen.preferredTrackType || '', screen.preferredOperator) : '', screen.preferredFabric ? getFabricName(screen.preferredFabric) : '', screen.preferredFrameColor ? getFrameColorName(screen.preferredFrameColor) : ''].filter(Boolean).join(' / ')}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            // ─── Configured screen card (blue/solid, with pricing) ───
            const clientTrackName = getClientFacingTrackName(screen.trackTypeName);
            const clientMotorName = getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName);
            const accessoriesText = (screen.accessories || []).length > 0
                ? screen.accessories.map(a => a.name).join(', ')
                : 'None';

            const isExcluded = screen.excluded;
            const excludeBtn = isExcluded
                ? `<button class="btn-include" onclick="toggleExclude(${index})">Include</button>`
                : `<button class="btn-exclude" onclick="toggleExclude(${index})">Exclude</button>`;

            const inlineEditorHtml = isEditing ? renderInlineEditor(index) : '';

            html += `
                <div class="screen-card ${isEditing ? 'editing' : ''} ${isExcluded ? 'excluded' : ''}">
                    <div class="screen-card-header">
                        <h4>
                            <span style="background: ${isExcluded ? '#999' : '#004a95'}; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-right: 6px;">${isExcluded ? 'EXCLUDED' : 'CONFIGURED'}</span>
                            ${displayName}${isEditing ? ' <span style="color: #007bff;">(Editing...)</span>' : ''}
                        </h4>
                        <div class="screen-card-actions">
                            ${isEditing ? '' : `<button class="btn-edit" onclick="editScreen(${index})">Edit</button>`}
                            ${isEditing ? '' : `<button class="btn-duplicate" onclick="duplicateScreen(${index})">Duplicate</button>`}
                            ${isEditing ? '' : excludeBtn}
                            ${isEditing ? '' : `<button class="btn-remove" onclick="removeScreen(${index})">Remove</button>`}
                        </div>
                    </div>
                    <div class="screen-card-details">
                        <strong>Track:</strong> ${clientTrackName} |
                        <strong>Motor:</strong> ${clientMotorName}<br>
                        <strong>Size:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H |
                        <strong>Fabric:</strong> ${screen.fabricColorName} |
                        <strong>Frame:</strong> ${screen.frameColorName || 'Not specified'}<br>
                        ${screen.noTracks ? '<strong>Configuration:</strong> No Tracks<br>' : ''}
                        <strong>Accessories:</strong> ${accessoriesText}<br>
                        ${screen.includeInstallation ? '<strong>Installation:</strong> Included<br>' : ''}
                        ${screen.wiringDistance > 0 ? `<strong>Wiring:</strong> ${screen.wiringDistance}"<br>` : ''}
                        ${photoCount > 0 ? `<strong>Photos:</strong> ${photoCount}<br>` : ''}
                        <strong>Price:</strong> ${isExcluded ? '<s>' + formatCurrency(screen.customerPrice) + '</s>' : formatCurrency(screen.customerPrice)}
                    </div>
                    ${inlineEditorHtml}
                </div>
            `;
        }
    });

    screensList.innerHTML = html;

    // Show/hide project accessories section based on configured screens
    const projAccSection = document.getElementById('projectAccessoriesSection');
    if (configuredCount > 0) {
        projAccSection.style.display = 'block';
        const listEl = document.getElementById('projectAccessoriesList');
        if (listEl.style.display !== 'none') {
            renderProjectAccessories();
        }
    } else {
        projAccSection.style.display = 'none';
        projectAccessories = [];
    }

    // Update Phase 2 section visibility and opening selector
    updatePhase2Visibility();
}

function editScreen(index) {
    const screen = screensInOrder[index];
    editingScreenIndex = index;
    const displayName = screen.screenName || `Opening ${index + 1}`;

    // Populate Phase 1 form fields (common to both openings and configured screens)
    document.getElementById('screenName').value = screen.screenName || '';
    document.getElementById('includeInstallation').checked = screen.includeInstallation;
    document.getElementById('wiringDistance').value = screen.wiringDistance || '';
    updateWiringVisibility();

    // Restore photos
    existingScreenPhotos = (screen.photos || []).slice();
    pendingScreenPhotos = (screen.pendingPhotos || []).slice();
    renderPhotoPreview();

    // Set dimensions from stored raw values or from rounded feet
    if (screen.widthInputValue !== undefined) {
        document.getElementById('widthInches').value = screen.widthInputValue;
        document.getElementById('widthFraction').value = screen.widthFractionValue || '';
        document.getElementById('heightInches').value = screen.heightInputValue;
        document.getElementById('heightFraction').value = screen.heightFractionValue || '';
    } else {
        document.getElementById('widthInches').value = screen.width * 12;
        document.getElementById('widthFraction').value = '';
        document.getElementById('heightInches').value = screen.height * 12;
        document.getElementById('heightFraction').value = '';
    }
    updatePricingDimensions();
    checkDimensionLimits();

    // Restore quick config preferences for openings
    if (screen.phase === 'opening') {
        if (screen.preferredTrackType) {
            document.getElementById('prefTrackType').value = screen.preferredTrackType;
            updatePrefOperatorOptions();
            if (screen.preferredOperator) {
                document.getElementById('prefOperator').value = screen.preferredOperator;
            }
        }
        if (screen.preferredFabric) document.getElementById('prefFabric').value = screen.preferredFabric;
        if (screen.preferredFrameColor) document.getElementById('prefFrameColor').value = screen.preferredFrameColor;
        if (screen.preferredTrackType || screen.preferredOperator || screen.preferredFabric || screen.preferredFrameColor) {
            document.getElementById('quickConfigBody').style.display = 'block';
            document.getElementById('quickConfigToggleIcon').innerHTML = '&#9650;';
        }
    }

    if (screen.phase === 'configured') {
        // Use inline editing for configured screens — no scroll, no form population
        editingScreenIndex = index;
        renderScreensList();
        // Scroll to the card being edited
        setTimeout(() => {
            const cards = document.querySelectorAll('#screensList .screen-card');
            if (cards[index]) cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        return; // Exit early — inline editor handles the rest
    }

    // Update button text to show we're editing
    updateAddToOrderButton();
    updatePhase1Header();

    // Update the screen card display to show editing state
    renderScreensList();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    alert(`Editing "${displayName}". Make changes above and click "Add Opening" to save.`);
}

// ─── Inline Card Editing (configured screens) ──────────────────────────────

function renderInlineEditor(index) {
    const screen = screensInOrder[index];
    if (!screen || screen.phase !== 'configured') return '';

    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;
    const trackOptions = getTrackTypeOptions();
    const operatorOptions = getOperatorOptionsForTrack(screen.trackType, isGuarantee);
    const fabricOptions = getFabricOptions();
    const frameOptions = getFrameColorOptions();

    // Build accessories HTML
    const accHtml = renderInlineAccessoriesHtml(index, screen);

    return `
        <div class="inline-editor">
            <div class="ie-dimensions">
                <strong>Dimensions:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H
                <a href="javascript:void(0)" onclick="remeasureScreen(${index})" style="margin-left: 10px; font-size: 0.8rem;">Re-measure</a>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Screen Name</label>
                    <input type="text" id="ie-name-${index}" value="${escapeAttr(screen.screenName || '')}">
                </div>
                <div class="form-group">
                    <label>Track Type</label>
                    <select id="ie-track-${index}" onchange="inlineTrackChanged(${index})">
                        ${buildSelectOptionsHtml(trackOptions, screen.trackType, '-- Select Track --')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Operator/Motor</label>
                    <select id="ie-operator-${index}">
                        ${buildSelectOptionsHtml(operatorOptions, screen.operatorType, '-- Select Motor --')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Fabric Color</label>
                    <select id="ie-fabric-${index}">
                        ${buildSelectOptionsHtml(fabricOptions, screen.fabricColor, '-- Select Fabric --')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Frame Color</label>
                    <select id="ie-frame-${index}">
                        ${buildSelectOptionsHtml(frameOptions, screen.frameColor, '-- Select Frame --')}
                    </select>
                </div>
                <div class="form-group" id="ie-notracks-group-${index}" style="${screen.trackType === 'sunair-zipper' ? '' : 'display:none;'}">
                    <label style="display: flex; align-items: center; gap: 6px; margin-top: 20px;">
                        <input type="checkbox" id="ie-notracks-${index}" ${screen.noTracks ? 'checked' : ''}>
                        No Tracks
                    </label>
                </div>
            </div>
            <div class="ie-accessories" id="ie-accessories-${index}">
                ${accHtml}
            </div>
            <div class="ie-actions">
                <button class="btn-primary" onclick="saveInlineEdit(${index})" style="padding: 6px 16px; font-size: 0.85rem;">Save</button>
                <button class="btn-secondary" onclick="cancelInlineEdit(${index})" style="padding: 6px 16px; font-size: 0.85rem;">Cancel</button>
            </div>
        </div>
    `;
}

function renderInlineAccessoriesHtml(index, screen) {
    const trackType = screen.trackType;
    const operatorType = screen.operatorType;

    // Determine which accessories apply
    let accList = [];
    if (operatorType && operatorType !== 'gear') {
        if (operatorType.startsWith('gaposa')) {
            accList = typeof gaposaAccessories !== 'undefined' ? gaposaAccessories : [];
        } else if (operatorType.startsWith('somfy')) {
            accList = typeof somfyAccessories !== 'undefined' ? somfyAccessories : [];
        }
    }

    if (accList.length === 0) return '<p style="font-size: 0.8rem; color: #888;">No accessories for this motor type.</p>';

    const existingNames = (screen.accessories || []).map(a => a.name);
    let html = '<label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 4px; display: block;">Accessories</label>';
    accList.forEach(acc => {
        const checked = existingNames.includes(acc.name) ? 'checked' : '';
        html += `
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; padding: 2px 0;">
                <input type="checkbox" class="ie-acc-${index}" data-name="${escapeAttr(acc.name)}" data-cost="${acc.cost}" data-markup="${acc.needsMarkup ? 'true' : 'false'}" ${checked}>
                ${escapeAttr(acc.name)} (${formatCurrency(acc.cost * CUSTOMER_MARKUP)})
            </label>
        `;
    });
    return html;
}

function inlineTrackChanged(index) {
    const trackType = document.getElementById(`ie-track-${index}`).value;
    const operatorSelect = document.getElementById(`ie-operator-${index}`);
    const noTracksGroup = document.getElementById(`ie-notracks-group-${index}`);
    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;

    // Update operator options
    const options = getOperatorOptionsForTrack(trackType, isGuarantee);
    operatorSelect.innerHTML = buildSelectOptionsHtml(options, '', '-- Select Motor --');

    // Toggle no-tracks visibility
    noTracksGroup.style.display = trackType === 'sunair-zipper' ? '' : 'none';
    if (trackType !== 'sunair-zipper') {
        document.getElementById(`ie-notracks-${index}`).checked = false;
    }

    // Rebuild accessories (need to update after operator change)
    const screen = screensInOrder[index];
    const accContainer = document.getElementById(`ie-accessories-${index}`);
    accContainer.innerHTML = renderInlineAccessoriesHtml(index, { ...screen, trackType, operatorType: '' });
}

function saveInlineEdit(index) {
    const screen = screensInOrder[index];

    const trackType = document.getElementById(`ie-track-${index}`).value;
    const operatorType = document.getElementById(`ie-operator-${index}`).value;
    const fabricColor = document.getElementById(`ie-fabric-${index}`).value;
    const frameColor = document.getElementById(`ie-frame-${index}`).value;

    if (!trackType || !operatorType || !fabricColor || !frameColor) {
        alert('Please fill all required fields.');
        return;
    }

    const trackTypeName = getTrackTypeName(trackType);
    const operatorTypeName = getOperatorTypeName(trackType, operatorType);
    const fabricColorName = getFabricName(fabricColor);
    const frameColorName = getFrameColorName(frameColor);
    const noTracks = document.getElementById(`ie-notracks-${index}`).checked;
    const screenName = document.getElementById(`ie-name-${index}`).value.trim();
    const guaranteeActive = document.getElementById('fourWeekGuarantee').checked;

    // Collect inline accessories
    const accessories = [];
    document.querySelectorAll(`.ie-acc-${index}:checked`).forEach(cb => {
        let accCost = parseFloat(cb.dataset.cost);
        const needsMarkup = cb.dataset.markup === 'true';
        if (needsMarkup) accCost = accCost * (1 - SUNAIR_DISCOUNT);
        accessories.push({ name: cb.dataset.name, cost: accCost, needsMarkup });
    });

    const result = computeScreenPricing({
        screenName: screenName || screen.screenName,
        trackType, trackTypeName,
        operatorType, operatorTypeName,
        fabricColor, fabricColorName,
        frameColor, frameColorName,
        width: screen.width,
        height: screen.height,
        totalWidthInches: screen.totalWidthInches,
        totalHeightInches: screen.totalHeightInches,
        actualWidthDisplay: screen.actualWidthDisplay,
        actualHeightDisplay: screen.actualHeightDisplay,
        noTracks,
        includeInstallation: screen.includeInstallation,
        wiringDistance: screen.wiringDistance,
        accessories,
        guaranteeActive,
        photos: screen.photos || [],
        pendingPhotos: screen.pendingPhotos || [],
        widthInputValue: screen.widthInputValue,
        widthFractionValue: screen.widthFractionValue,
        heightInputValue: screen.heightInputValue,
        heightFractionValue: screen.heightFractionValue
    });

    if (!result) {
        alert('Pricing failed — check dimensions against the selected track type.');
        return;
    }

    // Preserve entity IDs and exclude state
    result._openingId = screen._openingId;
    result._lineItemId = screen._lineItemId;
    result.excluded = screen.excluded;

    screensInOrder[index] = result;
    editingScreenIndex = null;
    renderScreensList();

    // Recalculate if summary is visible
    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary && !quoteSummary.classList.contains('hidden')) {
        calculateOrderQuote();
    }
}

function cancelInlineEdit(index) {
    editingScreenIndex = null;
    renderScreensList();
}

function remeasureScreen(index) {
    const screen = screensInOrder[index];
    if (!screen) return;

    // Reset to opening phase (keep product config for re-apply after)
    editingScreenIndex = index;

    // Populate Phase 1 form with opening's dimensions
    document.getElementById('screenName').value = screen.screenName || '';
    document.getElementById('includeInstallation').checked = screen.includeInstallation;
    document.getElementById('wiringDistance').value = screen.wiringDistance || '';
    updateWiringVisibility();

    if (screen.widthInputValue !== undefined) {
        document.getElementById('widthInches').value = screen.widthInputValue;
        document.getElementById('widthFraction').value = screen.widthFractionValue || '';
        document.getElementById('heightInches').value = screen.heightInputValue;
        document.getElementById('heightFraction').value = screen.heightFractionValue || '';
    } else {
        document.getElementById('widthInches').value = screen.width * 12;
        document.getElementById('widthFraction').value = '';
        document.getElementById('heightInches').value = screen.height * 12;
        document.getElementById('heightFraction').value = '';
    }
    updatePricingDimensions();
    checkDimensionLimits();

    existingScreenPhotos = (screen.photos || []).slice();
    pendingScreenPhotos = (screen.pendingPhotos || []).slice();
    renderPhotoPreview();

    updateAddToOrderButton();
    updatePhase1Header();
    renderScreensList();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert(`Re-measuring "${screen.screenName || 'Screen'}". Update dimensions and click "Add Opening" to save.`);
}

function updateAddToOrderButton() {
    const addToOrderBtn = document.getElementById('addToOrderBtn');
    const addOpeningBtn = document.getElementById('addOpeningBtn');

    if (editingScreenIndex !== null) {
        const screen = screensInOrder[editingScreenIndex];
        if (screen && screen.phase === 'configured') {
            // Editing a configured screen — show "Update Screen" (full entry)
            if (addToOrderBtn) {
                addToOrderBtn.textContent = 'Update Screen';
                addToOrderBtn.style.display = '';
                addToOrderBtn.style.background = '#28a745';
            }
            if (addOpeningBtn) {
                addOpeningBtn.textContent = 'Update Opening Only';
                addOpeningBtn.style.background = '';
            }
        } else {
            // Editing an opening — show "Update Opening"
            if (addOpeningBtn) {
                addOpeningBtn.textContent = 'Update Opening';
                addOpeningBtn.style.background = '#28a745';
            }
            if (addToOrderBtn) {
                addToOrderBtn.style.display = 'none';
            }
        }
    } else {
        // Normal mode — show "Add Opening", hide "Add to Order"
        if (addOpeningBtn) {
            addOpeningBtn.textContent = 'Add Opening';
            addOpeningBtn.style.background = '';
        }
        if (addToOrderBtn) {
            addToOrderBtn.textContent = 'Add to Order';
            addToOrderBtn.style.display = 'none';
            addToOrderBtn.style.background = '';
        }
    }
}

function duplicateScreen(index) {
    const screen = JSON.parse(JSON.stringify(screensInOrder[index])); // Deep copy
    screen.screenName = screen.screenName ? `${screen.screenName} (Copy)` : null;
    screen.pendingPhotos = []; // Pending photos (Blobs) can't be deep-copied; start fresh
    screensInOrder.push(screen);
    renderScreensList();
}

function removeScreen(index) {
    if (!confirm('Are you sure you want to remove this screen?')) return;
    screensInOrder.splice(index, 1);
    renderScreensList();

    if (screensInOrder.length === 0) {
        document.getElementById('screensInOrder').classList.add('hidden');
        document.getElementById('quoteSummary').classList.add('hidden');
    }
}

// ─── Phase 2: Configuration Functions ───────────────────────────────────────

/**
 * Show/hide the Phase 2 "Configure Screens" section based on unconfigured openings.
 * Also renders the opening selector checkboxes and updates the Apply button count.
 */
function updatePhase2Visibility() {
    const phase2Section = document.getElementById('phase2Section');
    if (!phase2Section) return;

    // Show Phase 2 whenever there are any screens (configured or unconfigured)
    // Users can re-apply configuration to override existing settings
    if (screensInOrder.length > 0) {
        phase2Section.style.display = '';
        renderOpeningSelector();
    } else {
        phase2Section.style.display = 'none';
    }
}

/**
 * Render checkboxes for ALL openings in the Phase 2 selector.
 * Unconfigured openings are checked by default; configured screens are unchecked
 * but enabled so users can re-apply configuration to override existing settings.
 */
function renderOpeningSelector() {
    const listEl = document.getElementById('openingSelectorList');
    if (!listEl) return;

    let html = '';
    screensInOrder.forEach((screen, index) => {
        const isConfigured = screen.phase === 'configured';
        const name = screen.screenName || (isConfigured ? `Screen ${index + 1}` : `Opening ${index + 1}`);
        const photoCount = (screen.photos || []).length + (screen.pendingPhotos || []).length;
        const checked = isConfigured ? '' : 'checked';

        // Config summary for configured screens
        let configSummary = '';
        if (isConfigured) {
            const parts = [];
            if (screen.trackTypeName) parts.push(screen.trackTypeName.replace(' Track', ''));
            if (screen.operatorTypeName) parts.push(screen.operatorTypeName.replace(' Motor', '').replace(' Operation (Manual)', ''));
            if (screen.fabricColorName) parts.push(screen.fabricColorName);
            configSummary = parts.length > 0 ? `<span style="color: #004a95; font-size: 0.8rem;">(${parts.join(' / ')})</span>` : '';
        }

        const labelColor = isConfigured ? 'color: #004a95;' : 'color: #b8860b;';

        html += `
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background=''">
                <input type="checkbox" class="opening-selector-cb" data-index="${index}" ${checked} onchange="updateApplyButtonCount()">
                <span style="font-weight: 600; font-size: 0.9rem; ${labelColor}">${escapeAttr(name)}</span>
                <span style="color: #666; font-size: 0.85rem;">(${screen.actualWidthDisplay} × ${screen.actualHeightDisplay})</span>
                ${configSummary}
                ${photoCount > 0 ? `<span style="color: #888; font-size: 0.8rem;">— ${photoCount} photo${photoCount !== 1 ? 's' : ''}</span>` : ''}
            </label>
        `;
    });

    listEl.innerHTML = html;
    updateApplyButtonCount();
}

/**
 * Update the "Apply to Selected (N)" button label with selected count.
 */
function updateApplyButtonCount() {
    const btn = document.getElementById('applyConfigBtn');
    if (!btn) return;
    const checkedCount = document.querySelectorAll('.opening-selector-cb:checked').length;
    btn.textContent = `Apply to Selected (${checkedCount})`;
    btn.disabled = checkedCount === 0;
}

function selectAllOpenings() {
    document.querySelectorAll('.opening-selector-cb').forEach(cb => { cb.checked = true; });
    updateApplyButtonCount();
}

function selectNoOpenings() {
    document.querySelectorAll('.opening-selector-cb').forEach(cb => { cb.checked = false; });
    updateApplyButtonCount();
}

/**
 * "Configure" button on a single opening card:
 * Checks just that one opening in the selector, scrolls to Phase 2.
 */
function configureOpening(index) {
    // Uncheck all, then check just this one
    document.querySelectorAll('.opening-selector-cb').forEach(cb => {
        cb.checked = (parseInt(cb.dataset.index) === index);
    });
    updateApplyButtonCount();

    // Scroll to Phase 2 section
    const phase2 = document.getElementById('phase2Section');
    if (phase2) {
        phase2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

/**
 * Apply the current Phase 2 product configuration to all selected openings.
 * Reads track/operator/fabric/accessories from the Phase 2 DOM form,
 * calls computeScreenPricing() for each selected opening.
 */
function applyConfiguration() {
    // Read Phase 2 fields
    const trackType = document.getElementById('trackType').value;
    const operatorType = document.getElementById('operatorType').value;
    const fabricColor = document.getElementById('fabricColor').value;
    const frameColor = document.getElementById('frameColor').value;

    if (!trackType || !operatorType || !fabricColor || !frameColor) {
        alert('Please select Track Type, Operator/Motor, Fabric Color, and Frame Color before applying.');
        return;
    }

    const trackTypeName = document.getElementById('trackType').selectedOptions[0].text;
    const operatorTypeName = document.getElementById('operatorType').selectedOptions[0].text;
    const fabricColorName = document.getElementById('fabricColor').selectedOptions[0].text;
    const frameColorName = document.getElementById('frameColor').selectedOptions[0].text;
    const noTracks = document.getElementById('noTracks').checked;
    const guaranteeActive = document.getElementById('fourWeekGuarantee').checked;

    // Collect accessories from Phase 2 DOM
    const accessories = [];
    document.querySelectorAll('.accessory-item input[type="checkbox"]:checked').forEach(cb => {
        let accCost = parseFloat(cb.dataset.cost);
        const needsDiscount = cb.dataset.markup === 'true';
        if (needsDiscount) accCost = accCost * (1 - SUNAIR_DISCOUNT);
        accessories.push({ name: cb.dataset.name, cost: accCost, needsMarkup: needsDiscount });
    });

    // Get selected opening indices
    const selectedIndices = [];
    document.querySelectorAll('.opening-selector-cb:checked').forEach(cb => {
        selectedIndices.push(parseInt(cb.dataset.index));
    });

    if (selectedIndices.length === 0) {
        alert('No openings selected. Please check at least one opening to configure.');
        return;
    }

    const failures = [];
    let successCount = 0;

    selectedIndices.forEach(idx => {
        const opening = screensInOrder[idx];
        if (!opening) return;

        // Preserve entity IDs and excluded state when overriding configured screens
        const preservedOpeningId = opening._openingId;
        const preservedLineItemId = opening._lineItemId;
        const preservedExcluded = opening.excluded || false;

        // Resolve effective config: opening preference > Phase 2 form value
        const effTrackType = opening.preferredTrackType || trackType;
        const effOperatorType = opening.preferredOperator || operatorType;
        const effFabricColor = opening.preferredFabric || fabricColor;
        const effFrameColor = opening.preferredFrameColor || frameColor;
        const effTrackTypeName = effTrackType !== trackType ? getTrackTypeName(effTrackType) : trackTypeName;
        const effOperatorTypeName = effOperatorType !== operatorType ? getOperatorTypeName(effTrackType, effOperatorType) : operatorTypeName;
        const effFabricColorName = effFabricColor !== fabricColor ? getFabricName(effFabricColor) : fabricColorName;
        const effFrameColorName = effFrameColor !== frameColor ? getFrameColorName(effFrameColor) : frameColorName;

        const result = computeScreenPricing({
            screenName: opening.screenName,
            trackType: effTrackType, trackTypeName: effTrackTypeName,
            operatorType: effOperatorType, operatorTypeName: effOperatorTypeName,
            fabricColor: effFabricColor, fabricColorName: effFabricColorName,
            frameColor: effFrameColor, frameColorName: effFrameColorName,
            width: opening.width,
            height: opening.height,
            totalWidthInches: opening.totalWidthInches,
            totalHeightInches: opening.totalHeightInches,
            actualWidthDisplay: opening.actualWidthDisplay,
            actualHeightDisplay: opening.actualHeightDisplay,
            noTracks,
            includeInstallation: opening.includeInstallation,
            wiringDistance: opening.wiringDistance,
            accessories: JSON.parse(JSON.stringify(accessories)), // Deep copy per screen
            guaranteeActive,
            photos: opening.photos || [],
            pendingPhotos: opening.pendingPhotos || [],
            widthInputValue: opening.widthInputValue,
            widthFractionValue: opening.widthFractionValue,
            heightInputValue: opening.heightInputValue,
            heightFractionValue: opening.heightFractionValue
        });

        if (result.error) {
            const name = opening.screenName || `Opening ${idx + 1}`;
            failures.push(`${name}: ${result.error}`);
        } else {
            // Preserve entity IDs and excluded state from previous configuration
            result._openingId = preservedOpeningId;
            result._lineItemId = preservedLineItemId;
            result.excluded = preservedExcluded;
            screensInOrder[idx] = result;
            successCount++;
        }
    });

    if (failures.length > 0) {
        alert(`Configured ${successCount} screen${successCount !== 1 ? 's' : ''}.\n\nFailed for:\n${failures.join('\n')}`);
    }

    renderScreensList();

    // Hide quote summary since order changed
    document.getElementById('quoteSummary').classList.add('hidden');
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
        // Entity IDs for sync
        _contactId: currentContactId || null,
        _propertyId: currentPropertyId || null
    });

    // Auto-save after calculating quote
    autoSaveQuote();
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
            <span>${orderData.screens.length}</span>
        </div>
        ${orderData.fourWeekGuarantee ? `
        <div style="margin-bottom: 12px; padding: 8px 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
            <strong style="color: #2e7d32;">4-Week Install Guarantee</strong>
        </div>
        ` : ''}
    `;

    // Add each screen details
    orderData.screens.forEach((screen, index) => {
        const displayName = screen.screenName || `Screen ${index + 1}`;
        const screenMaterialsPrice = screen.customerPrice - screen.installationPrice;
        const clientTrackName = getClientFacingTrackName(screen.trackTypeName);
        const clientMotorName = getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName);

        customerHTML += `
            <div style="margin-bottom: 15px; padding: 10px; background: #f0f8ff; border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #0056A3; padding-bottom: 8px; margin-bottom: 8px;">
                    <strong style="flex: 1;">${displayName}</strong>
                    <div style="display: flex; gap: 20px; align-items: center;">
                        ${hasComparison ? `
                            <div style="text-align: right;">
                                <div style="font-size: 0.75rem; color: #666; margin-bottom: 2px;">${primaryLabel}</div>
                                <strong>${formatCurrency(screenMaterialsPrice)}</strong>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.75rem; color: #666; margin-bottom: 2px;">${comparisonLabel}</div>
                                ${screen.comparisonMaterialPrice !== null && screen.comparisonMaterialPrice !== undefined
                                    ? `<strong style="color: #007bff;">${formatCurrency(screen.comparisonMaterialPrice)}</strong>`
                                    : `<strong style="color: #999;">N/A</strong>`}
                            </div>
                        ` : `
                            <strong>${formatCurrency(screenMaterialsPrice)}</strong>
                        `}
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
                    <strong>Installation:</strong>
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
                    <strong>Wiring:</strong>
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
                    <strong>Installation:</strong>
                    <strong>${formatCurrency(orderData.orderTotalInstallationPrice)}</strong>
                </div>
            `;
        }

        if (orderData.orderTotalWiringPrice > 0) {
            customerHTML += `
                <div class="summary-row">
                    <strong>Wiring:</strong>
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
