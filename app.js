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

// ─── Sales Rep Management ─────────────────────────────────────────────────────
let salesRepsList = []; // Cached list of all sales reps from Airtable
let originalSalesRepId = ''; // Track original rep for change detection

async function loadSalesReps() {
    try {
        const response = await fetch(`${WORKER_URL}/api/airtable/sales-reps`);
        const result = await response.json();
        if (result.success && result.salesReps) {
            salesRepsList = result.salesReps;
            const select = document.getElementById('salesRepSelect');
            select.innerHTML = '<option value="">-- Select Sales Rep --</option>';
            salesRepsList.forEach(rep => {
                select.innerHTML += `<option value="${rep.id}" data-email="${rep.email || ''}" data-phone="${rep.phone || ''}">${rep.name}</option>`;
            });
        }
    } catch (error) {
        console.error('Failed to load sales reps:', error);
    }
}

function updateSalesRepInfo() {
    const select = document.getElementById('salesRepSelect');
    const infoDiv = document.getElementById('salesRepInfo');
    const selectedOption = select.selectedOptions[0];

    if (select.value && selectedOption) {
        const email = selectedOption.dataset.email || '';
        const phone = selectedOption.dataset.phone || '';
        const parts = [];
        if (email) parts.push(email);
        if (phone) parts.push(phone);
        infoDiv.textContent = parts.join(' • ');
        infoDiv.style.display = parts.length > 0 ? 'block' : 'none';
    } else {
        infoDiv.style.display = 'none';
    }
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

        if (trackType === 'sunair-zipper') {
            operatorSelect.innerHTML += `
                <option value="gear">Gear Operation (Manual)</option>
                <option value="gaposa-rts">Gaposa RTS Motor</option>
                <option value="gaposa-solar">Gaposa Solar Motor</option>
                <option value="somfy-rts">Somfy RTS Motor</option>
            `;
            noTracksGroup.style.display = 'flex';
            cableSurchargeInfo.style.display = 'none';
        } else if (trackType === 'sunair-cable') {
            operatorSelect.innerHTML += `
                <option value="gear">Gear Operation (Manual)</option>
                <option value="gaposa-rts">Gaposa RTS Motor</option>
                <option value="gaposa-solar">Gaposa Solar Motor</option>
                <option value="somfy-rts">Somfy RTS Motor</option>
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
    });

    // Update accessories when operator type changes
    document.getElementById('operatorType').addEventListener('change', function() {
        updateAccessories();
        updateComparisonOptions();
    });

    // Update pricing dimensions when measurements change
    ['widthInches', 'widthFraction', 'heightInches', 'heightFraction'].forEach(id => {
        document.getElementById(id).addEventListener('input', updatePricingDimensions);
    });

    // Enable/disable comparison options
    document.getElementById('enableComparison').addEventListener('change', function() {
        const comparisonOptions = document.getElementById('comparisonOptions');
        comparisonOptions.style.display = this.checked ? 'grid' : 'none';
        if (!this.checked) {
            document.getElementById('comparisonMotor').value = '';
        }
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
});

// ─── Airtable Opportunity Search & Selection ────────────────────────────────

async function searchOpportunities(query) {
    const resultsDiv = document.getElementById('opportunitySearchResults');
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="opp-search-loading">Searching...</div>';

    try {
        const response = await fetch(
            `${WORKER_URL}/api/airtable/opportunities/search?q=${encodeURIComponent(query)}`
        );
        const result = await response.json();

        if (!response.ok || !result.success) {
            resultsDiv.innerHTML = `
                <div class="opp-search-loading" style="color: #c00;">
                    Search failed. You can enter customer info manually below.
                </div>
                <div class="opp-search-result manual-entry" onclick="selectManualEntry()">
                    + Create Customer Manually
                </div>
            `;
            return;
        }

        let html = '';

        if (result.opportunities.length === 0) {
            html += '<div class="opp-search-loading">No matching opportunities found.</div>';
        } else {
            result.opportunities.forEach(opp => {
                const contactName = opp.contact
                    ? `${opp.contact.firstName || ''} ${opp.contact.lastName || ''}`.trim()
                    : 'No contact';
                const dateStr = opp.dateTime
                    ? new Date(opp.dateTime).toLocaleDateString()
                    : '';

                // Store opp data as a data attribute to avoid inline JSON issues
                html += `
                    <div class="opp-search-result" data-opp-id="${escapeAttr(opp.id)}"
                         onclick="selectOpportunityById(this)">
                        <div class="opp-name">${escapeHtml(opp.name)}</div>
                        <div class="opp-details">
                            ${escapeHtml(contactName)}
                            ${opp.status ? ' &middot; ' + escapeHtml(opp.status) : ''}
                            ${dateStr ? ' &middot; ' + dateStr : ''}
                        </div>
                    </div>
                `;
            });
        }

        // Always show "Create Manually" at the bottom
        html += `
            <div class="opp-search-result manual-entry" onclick="selectManualEntry()">
                + Create Customer Manually
            </div>
        `;

        resultsDiv.innerHTML = html;

        // Store the full results data for lookup by ID
        window._oppSearchResults = result.opportunities;

    } catch (error) {
        console.error('Opportunity search error:', error);
        resultsDiv.innerHTML = `
            <div class="opp-search-loading" style="color: #c00;">
                Search unavailable. Enter customer info manually.
            </div>
            <div class="opp-search-result manual-entry" onclick="selectManualEntry()">
                + Create Customer Manually
            </div>
        `;
    }
}

function selectOpportunityById(element) {
    const oppId = element.dataset.oppId;
    const opp = (window._oppSearchResults || []).find(o => o.id === oppId);
    if (opp) {
        selectOpportunity(opp);
    }
}

function selectOpportunity(opp) {
    // Store Airtable IDs
    document.getElementById('airtableOpportunityId').value = opp.id;
    document.getElementById('airtableContactId').value = opp.contact ? opp.contact.id : '';

    // Populate form fields from Contact
    if (opp.contact) {
        const c = opp.contact;
        const fullName = `${c.firstName || ''} ${c.lastName || ''}`.trim();
        document.getElementById('customerName').value = fullName;
        document.getElementById('customerEmail').value = c.email || '';
        document.getElementById('customerPhone').value = c.phone || '';
        document.getElementById('streetAddress').value = c.streetAddress || '';
        document.getElementById('city').value = c.city || '';
        document.getElementById('state').value = c.state || 'AZ';
        document.getElementById('zipCode').value = c.zipCode || '';
        document.getElementById('companyName').value = c.companyName || '';

        // Show optional fields if any optional field has a value
        if (c.companyName || c.aptSuite || c.nearestIntersection) {
            document.getElementById('optionalCustomerFields').style.display = 'block';
            document.getElementById('toggleOptionalFields').textContent = '− Hide Addnl Fields';
        }
    }

    // Populate Sales Rep dropdown if available
    if (opp.salesRep && opp.salesRep.id) {
        const select = document.getElementById('salesRepSelect');
        select.value = opp.salesRep.id;
        originalSalesRepId = opp.salesRep.id;
        updateSalesRepInfo();
    }

    // Show linked banner
    const banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.remove('hidden');
    banner.style.display = 'flex';
    document.getElementById('linkedOpportunityText').textContent = 'Linked to: ' + opp.name;

    // Hide search results and clear search input
    document.getElementById('opportunitySearchResults').style.display = 'none';
    document.getElementById('opportunitySearch').value = '';
}

function selectManualEntry() {
    // Clear Airtable IDs and Sales Rep
    document.getElementById('airtableOpportunityId').value = '';
    document.getElementById('airtableContactId').value = '';
    document.getElementById('salesRepSelect').value = '';
    originalSalesRepId = '';
    updateSalesRepInfo();

    // Hide linked banner
    const banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.add('hidden');
    banner.style.display = 'none';

    // Hide search results and clear input
    document.getElementById('opportunitySearchResults').style.display = 'none';
    document.getElementById('opportunitySearch').value = '';
}

function unlinkOpportunity() {
    document.getElementById('airtableOpportunityId').value = '';
    document.getElementById('airtableContactId').value = '';
    document.getElementById('salesRepSelect').value = '';
    originalSalesRepId = '';
    updateSalesRepInfo();

    const banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.add('hidden');
    banner.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function escapeAttr(text) {
    if (!text) return '';
    return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;');
}

// ─── Save Guard ─────────────────────────────────────────────────────────────
let isSaving = false;

// ─── Original Functions ─────────────────────────────────────────────────────

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

function calculateScreenWithAlternateMotor(screen, alternateMotorType) {
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

    // Calculate customer price with alternate motor
    let customerPrice = screenOnlyCost * CUSTOMER_MARKUP;
    customerPrice += alternateMotorCost * CUSTOMER_MARKUP;

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

    const totalProfit = customerPrice - totalCost - installationCost;
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
        <div class="summary-row">
            <strong>Total Cost:</strong>
            <span>$${(quote.totalCost + quote.installationCost).toFixed(2)}</span>
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
    const saveBtn = document.querySelector('button[onclick="saveQuote()"]');
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (saveBtn) saveBtn.disabled = true;
    if (finalizeBtn) finalizeBtn.disabled = true;

    try {
        // Read fresh internal comments from textarea (may have changed since calculate)
        const internalComments = document.getElementById('internalComments')?.value || '';

        // Build the quote payload from currentOrderData
        const orderData = window.currentOrderData;
        orderData.internalComments = internalComments;

        const quoteData = {
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
            screens: orderData.screens,
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
            // Airtable integration fields
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            internalComments: internalComments,
            // Sales Rep info
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || ''
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
            // Write quoteNumber back so PDFs generated after saving show the real number
            if (result.quoteNumber) {
                window.currentOrderData.quoteNumber = result.quoteNumber;
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
        if (saveBtn) saveBtn.disabled = false;
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
            const totalPrice = quote.total_price ? formatCurrency(quote.total_price) : 'N/A';
            const quoteNum = quote.quote_number ? `<p><strong>Quote #:</strong> ${quote.quote_number}</p>` : '';

            html += `
                <div class="quote-card">
                    <h4>${quote.customer_name}</h4>
                    ${quoteNum}
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Screens:</strong> ${screenCount}</p>
                    <p><strong>Total:</strong> ${totalPrice}</p>
                    <div class="quote-card-actions">
                        <button class="btn-primary" onclick="loadQuote('${quote.id}')">Load</button>
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
            const banner = document.getElementById('linkedOpportunityBanner');
            banner.classList.remove('hidden');
            banner.style.display = 'flex';
            document.getElementById('linkedOpportunityText').textContent = 'Linked to Airtable Opportunity';
        } else {
            document.getElementById('airtableOpportunityId').value = '';
            document.getElementById('airtableContactId').value = '';
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
            screensInOrder = quote.screens;
            renderScreensList();
            document.getElementById('screensInOrder').classList.remove('hidden');

            // Restore discount settings
            document.getElementById('discountPercent').value = quote.discountPercent || 0;
            document.getElementById('discountLabel').value = quote.discountLabel || '';

            // Restore comparison settings
            if (quote.enableComparison) {
                document.getElementById('enableComparison').checked = true;
                document.getElementById('comparisonOptions').style.display = 'grid';
            }

            // Set currentOrderData and display the order summary
            window.currentOrderData = quote;
            displayOrderQuoteSummary(quote);
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

// ─── Data Mapping: currentOrderData → PDF template format ────────────────────
function mapOrderDataToTemplate(orderData) {
    const address = [
        orderData.streetAddress,
        orderData.aptSuite,
        [orderData.city, orderData.state, orderData.zipCode].filter(Boolean).join(', ')
    ].filter(Boolean).join(', ');

    const screens = (orderData.screens || []).map((screen, i) => ({
        name: screen.screenName || `Screen ${i + 1}`,
        track: getClientFacingTrackName(screen.trackTypeName),
        operator: getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName),
        fabric: screen.fabricColorName || '',
        frame: screen.frameColorName || '',
        width: screen.actualWidthDisplay || '',
        height: screen.actualHeightDisplay || '',
        price1: (screen.customerPrice || 0) - (screen.installationPrice || 0),
        price2: screen.comparisonMaterialPrice || null
    }));

    const materialsPrice = orderData.orderTotalMaterialsPrice || 0;
    const installationPrice = orderData.orderTotalInstallationPrice || 0;
    const discountPercent = orderData.discountPercent || 0;
    const discountAmount = orderData.discountAmount || 0;
    const subtotal = (discountPercent > 0 ? orderData.discountedMaterialsPrice : materialsPrice) + installationPrice;
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
        pricing: {
            materials: materialsPrice,
            installation: installationPrice,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            subtotal: subtotal,
            tax: 0,
            total: total,
            deposit: total / 2,
            balance: total / 2
        },
        comparisonPricing: null
    };

    // Build comparison pricing if enabled
    if (orderData.enableComparison) {
        const compMaterials = orderData.comparisonTotalMaterialsPrice || 0;
        const compDiscounted = orderData.comparisonDiscountedMaterialsPrice || compMaterials;
        const compSubtotal = (discountPercent > 0 ? compDiscounted : compMaterials) + installationPrice;
        const compTotal = orderData.comparisonTotalPrice || 0;

        // Get the first screen's operator to use as label
        const firstScreen = (orderData.screens || [])[0];
        const option1Label = firstScreen
            ? getClientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName)
            : 'Option 1';
        const option2Label = orderData.comparisonMotor
            ? getClientFacingOperatorName(orderData.comparisonMotor, orderData.comparisonMotor)
            : 'Option 2';

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

    // Fallback if html2pdf not loaded
    if (typeof html2pdf === 'undefined' || typeof generateQuotePDF === 'undefined') {
        console.warn('html2pdf or pdf-template not loaded, falling back to window.print()');
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
        const templateData = mapOrderDataToTemplate(window.currentOrderData);
        const htmlString = generateQuotePDF(templateData);

        // Create container for html2canvas rendering.
        // IMPORTANT: html2canvas cannot capture elements that are:
        //   - positioned at left:-9999px (outside viewport → blank canvas)
        //   - opacity:0 (fully transparent → blank canvas)
        // Solution: position in viewport with near-zero opacity (0.01).
        // This is effectively invisible but html2canvas still renders content.
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '0';
        container.style.top = '0';
        container.style.zIndex = '-1';
        container.style.opacity = '0.01';
        container.style.pointerEvents = 'none';
        container.innerHTML = htmlString;
        document.body.appendChild(container);

        // Override template dimensions for PDF generation.
        // The template sets width:8.5in and min-height:11in for on-screen preview,
        // but html2pdf adds its own margins, so the content must fit within the
        // remaining space (letter width minus left+right margins).
        const pageEl = container.querySelector('.page');
        if (pageEl) {
            pageEl.style.minHeight = 'auto';
            pageEl.style.width = '7.7in';
        }

        // Wait for fonts to load
        await document.fonts.ready;

        const quoteNum = window.currentOrderData.quoteNumber || 'DRAFT';
        const customerName = (window.currentOrderData.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
        const filename = `RAS-Quote-${quoteNum}-${customerName}.pdf`;

        // Generate PDF as blob then trigger download manually.
        // html2pdf's .save() can produce blank files in some browser/extension
        // configurations, so we use .outputPdf('blob') + blob URL instead.
        const pdfBlob = await html2pdf().set({
            margin: [0.4, 0.4, 0.5, 0.4],
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'] }
        }).from(pageEl || container).outputPdf('blob');

        document.body.removeChild(container);

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

// ─── Signature Functions ─────────────────────────────────────────────────────

/**
 * Ensure the current quote is saved to D1 before navigating away.
 * If already saved (has a quote_number from D1), does nothing.
 * Returns true if save succeeded, false otherwise.
 */
async function ensureQuoteSaved() {
    const orderData = window.currentOrderData;
    if (!orderData) return false;

    // Read fresh internal comments
    const internalComments = document.getElementById('internalComments')?.value || '';
    orderData.internalComments = internalComments;

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
            screens: orderData.screens,
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
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            internalComments: internalComments,
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || ''
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
    const saveBtn = document.querySelector('button[onclick="saveQuote()"]');
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (saveBtn) saveBtn.disabled = true;
    if (finalizeBtn) finalizeBtn.disabled = true;

    const orderData = window.currentOrderData;
    const orderId = orderData.id || Date.now();

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
                screens: orderData.screens,
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
                // Airtable integration fields
                airtableOpportunityId: orderData.airtableOpportunityId || '',
                airtableContactId: orderData.airtableContactId || '',
                internalComments: document.getElementById('internalComments')?.value || ''
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
        if (saveBtn) saveBtn.disabled = false;
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
    document.getElementById('discountLabel').value = '';
    document.getElementById('discountPercent').value = '0';
    updateAccessories();
    editingScreenIndex = null;

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
}

// Multi-screen order functions
function addToOrder() {
    // Calculate screen data
    const screenData = calculateScreenData();
    if (!screenData) return; // Validation failed

    if (editingScreenIndex !== null) {
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

    // Show screens section and hide quote
    document.getElementById('screensInOrder').classList.remove('hidden');
    document.getElementById('quoteSummary').classList.add('hidden');
}

function calculateScreenData() {
    // Get form values
    const screenName = document.getElementById('screenName').value.trim();
    const trackType = document.getElementById('trackType').value;
    const operatorType = document.getElementById('operatorType').value;
    const fabricColor = document.getElementById('fabricColor').value;
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
    if (!trackType || !operatorType || !fabricColor) {
        alert('Please fill in all required fields (marked with *)');
        return null;
    }

    if (totalWidthInches === 0 || totalHeightInches === 0) {
        alert('Please enter valid screen dimensions');
        return null;
    }

    // Get text labels
    const trackTypeName = document.getElementById('trackType').selectedOptions[0].text;
    const operatorTypeName = document.getElementById('operatorType').selectedOptions[0].text;
    const fabricColorName = document.getElementById('fabricColor').selectedOptions[0].text;
    const frameColor = document.getElementById('frameColor').value;
    const frameColorName = document.getElementById('frameColor').selectedOptions[0].text;

    // Calculate pricing
    const screenType = `${trackType}-${operatorType}`;
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

        // Apply Sunair discount for non-Fenetex screens
        if (!isFenetex) {
            screenCost = screenCost * (1 - SUNAIR_DISCOUNT);
        }

        screenCostOnly = screenCost;
        baseCost += screenCost;
    } else {
        alert(`Invalid screen dimensions. No pricing available for ${width}' W x ${height}' H. Please check the size and try again.`);
        return null;
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
    const accessories = [];
    const checkboxes = document.querySelectorAll('.accessory-item input[type="checkbox"]:checked');
    checkboxes.forEach(cb => {
        const accName = cb.dataset.name;
        let accCost = parseFloat(cb.dataset.cost);
        const needsDiscount = cb.dataset.markup === 'true';
        if (needsDiscount) {
            accCost = accCost * (1 - SUNAIR_DISCOUNT);
        }
        accessoriesCost += accCost;
        accessories.push({
            name: accName,
            cost: accCost,
            needsMarkup: needsDiscount
        });
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
        accessories.forEach(acc => {
            if (acc.needsMarkup) {
                customerPrice += acc.cost * CUSTOMER_MARKUP;
            } else {
                customerPrice += acc.cost;
            }
        });
    } else {
        // Standard Sunair pricing - separate screen and motor markup
        let screenOnlyCost = baseCost - motorCost;

        // Handle track deduction
        if (noTracks) {
            screenOnlyCost -= trackDeduction;
        }

        // Apply 1.8x markup to screen
        customerPrice = screenOnlyCost * CUSTOMER_MARKUP;

        // Add motor with 1.8x markup
        customerPrice += motorCost * CUSTOMER_MARKUP;

        // Add back track deduction (negative value) after markup
        if (noTracks) {
            customerPrice += trackDeduction;
        }

        // Add accessories with their proper markup
        accessories.forEach(acc => {
            if (acc.needsMarkup) {
                customerPrice += acc.cost * CUSTOMER_MARKUP;
            } else {
                customerPrice += acc.cost;
            }
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

        installationCost = installationPrice * 0.7;
        customerPrice += installationPrice;
    }

    return {
        screenName: screenName || null,
        trackType,
        trackTypeName,
        operatorType,
        operatorTypeName,
        fabricColor,
        fabricColorName,
        frameColor,
        frameColorName,
        width,
        height,
        totalWidthInches,
        totalHeightInches,
        actualWidthDisplay,
        actualHeightDisplay,
        noTracks,
        includeInstallation,
        screenCostOnly,
        motorCost,
        baseCost,
        accessories,
        accessoriesCost,
        totalCost,
        installationCost,
        installationPrice,
        customerPrice,
        isFenetex,
        trackDeduction
    };
}

function resetFormForNextScreen() {
    document.getElementById('screenName').value = '';
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
    updateAccessories();
}

function renderScreensList() {
    const screensList = document.getElementById('screensList');
    const screenCount = document.getElementById('screenCount');

    screenCount.textContent = screensInOrder.length;

    if (screensInOrder.length === 0) {
        screensList.innerHTML = '<p>No screens added yet.</p>';
        return;
    }

    let html = '';
    screensInOrder.forEach((screen, index) => {
        const displayName = screen.screenName || `Screen ${index + 1}`;
        const clientTrackName = getClientFacingTrackName(screen.trackTypeName);
        const clientMotorName = getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName);
        const accessoriesText = screen.accessories.length > 0
            ? screen.accessories.map(a => a.name).join(', ')
            : 'None';
        const isEditing = editingScreenIndex === index;

        html += `
            <div class="screen-card ${isEditing ? 'editing' : ''}">
                <div class="screen-card-header">
                    <h4>${displayName}${isEditing ? ' <span style="color: #007bff;">(Editing...)</span>' : ''}</h4>
                    <div class="screen-card-actions">
                        <button class="btn-edit" onclick="editScreen(${index})">${isEditing ? 'Editing ↑' : 'Edit'}</button>
                        <button class="btn-duplicate" onclick="duplicateScreen(${index})">Duplicate</button>
                        <button class="btn-remove" onclick="removeScreen(${index})">Remove</button>
                    </div>
                </div>
                <div class="screen-card-details">
                    <strong>Track:</strong> ${clientTrackName} |
                    <strong>Motor:</strong> ${clientMotorName}<br>
                    <strong>Size:</strong> ${screen.actualWidthDisplay} W x ${screen.actualHeightDisplay} H |
                    <strong>Fabric:</strong> ${screen.fabricColorName} |
                    <strong>Frame:</strong> ${screen.frameColorName || 'Not specified'}<br>
                    ${screen.noTracks ? '<strong>Configuration:</strong> No Tracks<br>' : ''}
                    <strong>Accessories:</strong> ${accessoriesText}<br>
                    ${screen.includeInstallation ? '<strong>Installation:</strong> Included<br>' : ''}
                    <strong>Price:</strong> ${formatCurrency(screen.customerPrice)}
                </div>
            </div>
        `;
    });

    screensList.innerHTML = html;
}

function editScreen(index) {
    const screen = screensInOrder[index];
    editingScreenIndex = index;

    // Populate form with screen data
    document.getElementById('screenName').value = screen.screenName || '';
    document.getElementById('trackType').value = screen.trackType;
    document.getElementById('operatorType').value = screen.operatorType;
    document.getElementById('fabricColor').value = screen.fabricColor;
    document.getElementById('noTracks').checked = screen.noTracks;
    document.getElementById('includeInstallation').checked = screen.includeInstallation;

    // Set dimensions - need to calculate back from display
    // For simplicity, we'll use the pricing dimensions
    document.getElementById('widthInches').value = screen.width * 12;
    document.getElementById('widthFraction').value = '';
    document.getElementById('heightInches').value = screen.height * 12;
    document.getElementById('heightFraction').value = '';

    // Trigger track type change to populate operator dropdown
    const trackTypeSelect = document.getElementById('trackType');
    trackTypeSelect.dispatchEvent(new Event('change'));

    // Set operator type after dropdown is populated, then check accessories
    setTimeout(() => {
        document.getElementById('operatorType').value = screen.operatorType;
        // Update accessories after operator is set
        updateAccessories();

        // Check the accessories that were selected - wait for accessories to render
        setTimeout(() => {
            screen.accessories.forEach(acc => {
                const checkboxes = document.querySelectorAll('.accessory-item input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    if (cb.dataset.name === acc.name) {
                        cb.checked = true;
                    }
                });
            });
        }, 50);
    }, 10);

    // Update button text to show we're editing
    updateAddToOrderButton();

    // Update the screen card display to show editing state
    renderScreensList();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Show alert
    alert(`Editing "${displayName}". Make your changes above and click "Update Screen" to save.`);
}

function updateAddToOrderButton() {
    const btn = document.getElementById('addToOrderBtn');
    if (!btn) return;

    if (editingScreenIndex !== null) {
        btn.textContent = 'Update Screen';
        btn.style.background = '#28a745';
    } else {
        btn.textContent = 'Add to Order';
        btn.style.background = '';
    }
}

function duplicateScreen(index) {
    const screen = JSON.parse(JSON.stringify(screensInOrder[index])); // Deep copy
    screen.screenName = screen.screenName ? `${screen.screenName} (Copy)` : null;
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

function calculateOrderQuote() {
    if (screensInOrder.length === 0) {
        alert('Please add at least one screen to the order');
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
    let hasCableScreen = false;

    // Internal cost breakdowns
    let totalScreenCosts = 0;
    let totalMotorCosts = 0;
    let totalAccessoriesCosts = 0;
    let totalCableSurcharge = 0;

    screensInOrder.forEach((screen, index) => {
        // Materials price (excluding installation)
        let screenMaterialsPrice = screen.customerPrice - screen.installationPrice;

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

        // Track internal cost breakdowns
        totalScreenCosts += screen.screenCostOnly;
        totalMotorCosts += screen.motorCost;
        totalAccessoriesCosts += screen.accessoriesCost;
    });

    // Get discount information
    const discountPercent = parseFloat(document.getElementById('discountPercent').value) || 0;
    const discountLabel = document.getElementById('discountLabel').value.trim() || 'Discount';
    const discountAmount = (orderTotalMaterialsPrice * discountPercent) / 100;
    const discountedMaterialsPrice = orderTotalMaterialsPrice - discountAmount;

    const orderTotalPrice = discountedMaterialsPrice + orderTotalInstallationPrice;
    const totalProfit = orderTotalPrice - orderTotalCost - orderTotalInstallationCost;
    const marginPercent = orderTotalPrice > 0 ? (totalProfit / orderTotalPrice) * 100 : 0;

    // Get comparison information
    const enableComparison = document.getElementById('enableComparison').checked;
    const comparisonMotor = document.getElementById('comparisonMotor').value;

    // Calculate comparison totals if enabled
    let comparisonTotalMaterialsPrice = 0;
    let comparisonTotalPrice = 0;
    let comparisonDiscountedMaterialsPrice = 0;
    const comparisonScreens = [];

    if (enableComparison && comparisonMotor) {
        screensInOrder.forEach(screen => {
            // Compare all screens (motorized or gear) against the selected alternative
            if (screen.operatorType !== comparisonMotor) {
                const comparisonData = calculateScreenWithAlternateMotor(screen, comparisonMotor);
                comparisonScreens.push({
                    ...screen,
                    comparisonPrice: comparisonData.customerPrice,
                    comparisonMaterialPrice: comparisonData.materialPrice
                });
                comparisonTotalMaterialsPrice += comparisonData.materialPrice;
            } else {
                // Screen already uses the comparison operator — pass through same price
                comparisonScreens.push({
                    ...screen,
                    comparisonPrice: screen.customerPrice,
                    comparisonMaterialPrice: screen.customerPrice - screen.installationPrice
                });
                comparisonTotalMaterialsPrice += (screen.customerPrice - screen.installationPrice);
            }
        });

        // Apply discount to comparison totals
        const comparisonDiscountAmount = (comparisonTotalMaterialsPrice * discountPercent) / 100;
        comparisonDiscountedMaterialsPrice = comparisonTotalMaterialsPrice - comparisonDiscountAmount;
        comparisonTotalPrice = comparisonDiscountedMaterialsPrice + orderTotalInstallationPrice;
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
        id: Date.now(),
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
        screens: enableComparison && comparisonMotor ? comparisonScreens : screensInOrder,
        orderTotalCost,
        orderTotalMaterialsPrice,
        orderTotalInstallationPrice,
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
        comparisonMotor,
        comparisonTotalMaterialsPrice,
        comparisonDiscountedMaterialsPrice,
        comparisonTotalPrice,
        airtableOpportunityId,
        airtableContactId,
        internalComments,
        salesRepId,
        salesRepName,
        salesRepEmail,
        salesRepPhone
    });
}

function displayOrderQuoteSummary(orderData) {
    // Store order data globally for finalize page access
    window.currentOrderData = orderData;

    const summaryContent = document.getElementById('summaryContent');
    const internalInfo = document.getElementById('internalInfo');
    const quoteSummary = document.getElementById('quoteSummary');

    // Get operator names for comparison if enabled
    let comparisonMotorName = '';
    let clientMotorName = '';
    if (orderData.enableComparison && orderData.comparisonMotor && orderData.screens.length > 0) {
        comparisonMotorName = getClientFacingOperatorName(orderData.comparisonMotor, '');
        // Get the first screen's operator name for the header
        const firstScreen = orderData.screens[0];
        if (firstScreen) {
            clientMotorName = getClientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName);
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
                        ${orderData.enableComparison && orderData.comparisonMotor ? `
                            <div style="text-align: right;">
                                <div style="font-size: 0.75rem; color: #666; margin-bottom: 2px;">${clientMotorName}</div>
                                <strong>${formatCurrency(screenMaterialsPrice)}</strong>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 0.75rem; color: #666; margin-bottom: 2px;">${comparisonMotorName}</div>
                                <strong style="color: #007bff;">${formatCurrency(screen.comparisonMaterialPrice || screenMaterialsPrice)}</strong>
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

    // Add subtotal, discount, installation, and grand total
    if (orderData.enableComparison && orderData.comparisonMotor) {
        // Show comparison columns
        customerHTML += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; font-size: 1.05rem; border-top: 2px solid #0056A3; padding-top: 10px; margin-bottom: 8px;">
                <strong>Materials Subtotal:</strong>
                <div style="display: flex; gap: 20px;">
                    <div style="min-width: 120px; text-align: right;">
                        <div style="font-size: 0.75rem; color: #666; font-weight: normal; margin-bottom: 2px;">${clientMotorName}</div>
                        <strong>${formatCurrency(orderData.orderTotalMaterialsPrice)}</strong>
                    </div>
                    <div style="min-width: 120px; text-align: right;">
                        <div style="font-size: 0.75rem; color: #666; font-weight: normal; margin-bottom: 2px;">${comparisonMotorName}</div>
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

        if (orderData.orderTotalInstallationPrice > 0) {
            customerHTML += `
                <div class="summary-row">
                    <strong>Installation:</strong>
                    <strong>${formatCurrency(orderData.orderTotalInstallationPrice)}</strong>
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

    // Scroll to quote
    quoteSummary.scrollIntoView({ behavior: 'smooth' });
}
