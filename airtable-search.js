/**
 * airtable-search.js
 * Airtable opportunity search and sales rep management.
 *
 * Dependencies:
 *   - pricing-engine.js must be loaded first (provides escapeAttr)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - WORKER_URL: Worker base URL (from index.html)
 *
 * Also uses escapeHtml() from app.js for rendering search results.
 *
 * Extracted from app.js in Step 2 refactoring.
 */

// ─── Module-local state ──────────────────────────────────────────────────────
var salesRepsList = []; // Cached list of all sales reps from Airtable
var originalSalesRepId = ''; // Track original rep for change detection

// ─── Sales Rep Management ─────────────────────────────────────────────────────

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

            // Default to Tommy Whitby if no rep pre-selected
            if (!select.value) {
                const tommy = salesRepsList.find(rep => rep.name === 'Tommy Whitby');
                if (tommy) {
                    select.value = tommy.id;
                    updateSalesRepInfo();
                }
            }
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
    // Store Airtable IDs and opportunity name
    document.getElementById('airtableOpportunityId').value = opp.id;
    document.getElementById('airtableContactId').value = opp.contact ? opp.contact.id : '';
    document.getElementById('airtableOpportunityName').value = opp.name || '';

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
    document.getElementById('linkedOpportunityText').textContent = 'Linked to Airtable Opportunity ' + opp.name;

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
    document.getElementById('airtableOpportunityName').value = '';
    document.getElementById('salesRepSelect').value = '';
    originalSalesRepId = '';
    updateSalesRepInfo();

    const banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.add('hidden');
    banner.style.display = 'none';
}

// ─── Node.js exports (for testing) ───────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        loadSalesReps, updateSalesRepInfo,
        searchOpportunities, selectOpportunityById, selectOpportunity,
        selectManualEntry, unlinkOpportunity
    };
}
