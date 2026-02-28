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
 *   - window.currentOrderData: Set by displayOrderQuoteSummary()
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

// â”€â”€ Legacy Quote Calculator (Single-Screen) â”€â”€
// Functions moved to order-calculator.js:
//   calculateQuote, displayQuoteSummary

// -- Quote Persistence (Save/Load/Delete + Auto-Save + Email History) --
// Functions moved to quote-persistence.js:
//   autoSaveOpening, debouncedAutoSaveOpening, showAutoSaveIndicator,
//   saveDraft, saveQuote, loadSavedQuotes, loadQuote, deleteQuote,
//   viewSentEmails, showEmailsModal, refreshEmailHistory
// Module-local state moved: autoSaveTimers, AUTO_SAVE_DEBOUNCE_MS

// ── PDF, Signing & Finalization ──
// Functions moved to pdf-signing.js:
//   mapOrderDataToTemplate, generatePDF, generatePdfBlob, blobToBase64,
//   sendQuoteForSignature, presentForSignature, finalizeProjectDetails


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

// toggleExclude moved to screen-cards.js

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
// Functions moved to screen-cards.js:
//   getApplicableProjectAccessories, renderProjectAccessories,
//   toggleProjectAccessories, updateProjectAccessoryQuantity

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

// ── Screen Cards, Inline Editing, Phase 2 Selectors ──
// Functions moved to screen-cards.js:
//   renderScreensList, editScreen, renderInlineEditor, renderInlineAccessoriesHtml,
//   inlineTrackChanged, saveInlineEdit, cancelInlineEdit, remeasureScreen,
//   updateAddToOrderButton, duplicateScreen, removeScreen,
//   updatePhase2Visibility, renderOpeningSelector, updateApplyButtonCount,
//   selectAllOpenings, selectNoOpenings

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

// â”€â”€ Order Calculator (Multi-Screen) â”€â”€
// Functions moved to order-calculator.js:
//   calculateOrderQuote, displayOrderQuoteSummary