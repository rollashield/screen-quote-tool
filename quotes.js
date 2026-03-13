/**
 * quotes.js
 * Home page logic for quotes.html — quote listing, creation, and Airtable opportunity flow.
 *
 * Dependencies:
 *   - pricing-engine.js (provides formatCurrency, escapeAttr)
 *   - airtable-search.js (provides loadSalesReps, searchOpportunities, etc.)
 *   - nav-steps.js (builds step nav)
 *   - DOM elements from quotes.html must exist
 *   - WORKER_URL global from quotes.html inline script
 *
 * Uses escapeHtml() defined at bottom of this file (quotes.html has no app.js).
 */

// ─── State ──────────────────────────────────────────────────────────────────
var allQuotes = []; // Cached list of all quotes from API
var currentFilter = 'all';

// ─── Initialization ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
    // Clear any stale quote context
    sessionStorage.removeItem('currentQuoteId');

    // Load data
    loadSalesReps();
    loadQuotesList();

    // Opportunity search handler (debounced)
    var searchTimer = null;
    var searchInput = document.getElementById('opportunitySearch');
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        var query = searchInput.value.trim();
        if (query.length < 2) {
            document.getElementById('opportunitySearchResults').style.display = 'none';
            return;
        }
        searchTimer = setTimeout(function () { searchOpportunities(query); }, 300);
    });

    // Close search results on outside click
    document.addEventListener('click', function (e) {
        var container = document.querySelector('.opp-search-container');
        if (container && !container.contains(e.target)) {
            document.getElementById('opportunitySearchResults').style.display = 'none';
        }
    });

    // Sales rep change handler
    document.getElementById('salesRepSelect').addEventListener('change', updateSalesRepInfo);
});

// ─── escapeHtml (needed for airtable-search.js, which depends on app.js's version) ─
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ─── Load Quotes List ───────────────────────────────────────────────────────
async function loadQuotesList() {
    var grid = document.getElementById('quotesGrid');
    grid.innerHTML = '<p style="color: #666;">Loading quotes...</p>';

    try {
        var response = await fetch(WORKER_URL + '/api/quotes');
        var result = await response.json();

        if (!response.ok || !result.success) {
            grid.innerHTML = '<p style="color: #c00;">Failed to load quotes.</p>';
            return;
        }

        allQuotes = result.quotes || [];
        renderQuotesList();
    } catch (error) {
        console.error('Error loading quotes:', error);
        grid.innerHTML = '<p style="color: #c00;">Failed to load quotes. Check your connection.</p>';
    }
}

function renderQuotesList() {
    var grid = document.getElementById('quotesGrid');
    var filtered = allQuotes;

    if (currentFilter !== 'all') {
        filtered = allQuotes.filter(function (q) {
            var qs = q.quote_status || 'draft';
            var ps = q.payment_status || 'unpaid';
            if (currentFilter === 'paid') return ps === 'paid';
            if (currentFilter === 'draft') return qs === 'draft' || (!q.total_price || q.total_price === 0);
            return qs === currentFilter;
        });
    }

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="color: #666;">No quotes found.</p>';
        return;
    }

    var html = '';
    filtered.forEach(function (quote) {
        var date = new Date(quote.created_at).toLocaleDateString();
        var screenCount = quote.screen_count || 0;
        var isDraft = !quote.total_price || quote.total_price === 0;
        var totalPrice = isDraft ? '' : formatCurrency(quote.total_price);
        var quoteNum = quote.quote_number || '';

        // Status badge
        var qs = quote.quote_status || 'draft';
        var ps = quote.payment_status || 'unpaid';
        var badgeClass = '';
        var badgeText = '';
        var borderColor = '';
        if (ps === 'paid') {
            badgeClass = 'status-badge--paid'; badgeText = 'PAID'; borderColor = '#6f42c1';
        } else if (qs === 'signed') {
            badgeClass = 'status-badge--signed'; badgeText = 'SIGNED'; borderColor = '#28a745';
        } else if (qs === 'sent') {
            badgeClass = 'status-badge--sent'; badgeText = 'SENT'; borderColor = '#0071bc';
        } else {
            badgeClass = 'status-badge--draft'; badgeText = 'DRAFT'; borderColor = '#e67e22';
        }

        html += '<div class="quote-card" style="border-left: 3px solid ' + borderColor + ';" onclick="openQuote(\'' + quote.id + '\')">';
        html += '<h4>' + escapeHtml(quote.customer_name) + ' <span class="status-badge ' + badgeClass + '">' + badgeText + '</span></h4>';
        if (quoteNum) html += '<p><strong>Quote #:</strong> ' + escapeHtml(quoteNum) + '</p>';
        html += '<p><strong>Date:</strong> ' + date + '</p>';
        html += '<p><strong>Screens:</strong> ' + screenCount + '</p>';
        if (totalPrice) html += '<p><strong>Total:</strong> ' + totalPrice + '</p>';
        html += '<div class="quote-card-actions" onclick="event.stopPropagation()">';
        html += '<button class="btn-primary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="openQuote(\'' + quote.id + '\')">Open</button>';
        html += '<button class="btn-secondary" style="padding: 5px 12px; font-size: 0.8rem;" onclick="deleteQuoteFromList(\'' + quote.id + '\')">Delete</button>';
        html += '</div>';
        html += '</div>';
    });

    grid.innerHTML = html;
}

function filterQuotes(filter, btn) {
    currentFilter = filter;

    // Update button active states
    document.querySelectorAll('.filter-btn').forEach(function (b) {
        b.classList.remove('active');
    });
    if (btn) btn.classList.add('active');

    renderQuotesList();
}

// ─── Open Quote → Navigate to Editor ────────────────────────────────────────
function openQuote(quoteId) {
    sessionStorage.setItem('currentQuoteId', quoteId);
    window.location.href = 'index.html?quoteId=' + quoteId;
}

// ─── Delete Quote ───────────────────────────────────────────────────────────
async function deleteQuoteFromList(quoteId) {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    try {
        var response = await fetch(WORKER_URL + '/api/quote/' + quoteId, { method: 'DELETE' });
        var result = await response.json();

        if (response.ok && result.success) {
            allQuotes = allQuotes.filter(function (q) { return q.id !== quoteId; });
            renderQuotesList();
        } else {
            alert('Failed to delete quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting quote:', error);
        alert('Failed to delete quote.');
    }
}

// ─── Create New Quote (Manual Entry) ────────────────────────────────────────
async function createNewQuote() {
    var name = document.getElementById('newCustomerName').value.trim();
    var email = document.getElementById('newCustomerEmail').value.trim();
    var phone = document.getElementById('newCustomerPhone').value.trim();
    var zip = document.getElementById('newZipCode').value.trim();

    if (!name) { alert('Customer name is required.'); return; }
    if (!email) { alert('Email is required.'); return; }
    if (!zip) { alert('ZIP code is required.'); return; }

    var quoteId = Date.now().toString();

    var quoteData = {
        id: quoteId,
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        zipCode: zip,
        companyName: '',
        streetAddress: '',
        aptSuite: '',
        nearestIntersection: '',
        city: '',
        state: 'AZ',
        screens: [],
        orderTotalPrice: 0,
        orderTotalMaterialsPrice: 0,
        orderTotalInstallationPrice: 0,
        orderTotalInstallationCost: 0,
        orderTotalWiringCost: 0,
        orderTotalWiringPrice: 0,
        orderTotalCost: 0,
        totalProfit: 0,
        marginPercent: 0,
        hasCableScreen: false,
        totalScreenCosts: 0,
        totalMotorCosts: 0,
        totalAccessoriesCosts: 0,
        totalCableSurcharge: 0,
        discountPercent: 0,
        discountLabel: '',
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
        miscInstallLabel: '',
        miscInstallAmount: 0,
        miscInstallCost: 0,
        projectAccessories: [],
        projectAccessoriesTotalPrice: 0,
        projectAccessoriesTotalCost: 0,
        airtableOpportunityId: '',
        airtableContactId: '',
        airtableOpportunityName: '',
        internalComments: '',
        salesRepId: '',
        salesRepName: '',
        salesRepEmail: '',
        salesRepPhone: '',
        fourWeekGuarantee: false,
        totalGuaranteeDiscount: 0
    };

    // Include sales rep if selected
    var salesRepSelect = document.getElementById('salesRepSelect');
    var selectedRepOption = salesRepSelect ? salesRepSelect.selectedOptions[0] : null;
    if (salesRepSelect && salesRepSelect.value) {
        quoteData.salesRepId = salesRepSelect.value;
        quoteData.salesRepName = selectedRepOption ? selectedRepOption.textContent : '';
        quoteData.salesRepEmail = selectedRepOption ? (selectedRepOption.dataset.email || '') : '';
        quoteData.salesRepPhone = selectedRepOption ? (selectedRepOption.dataset.phone || '') : '';
    }

    try {
        var response = await fetch(WORKER_URL + '/api/save-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        var result = await response.json();

        if (response.ok && result.success) {
            openQuote(quoteId);
        } else {
            alert('Failed to create quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating quote:', error);
        alert('Failed to create quote. Check your internet connection.');
    }
}

// ─── Create Quote from Airtable Opportunity ─────────────────────────────────

// Override selectOpportunity from airtable-search.js to also enable the button
var _originalSelectOpportunity = typeof selectOpportunity === 'function' ? selectOpportunity : null;

// Store opportunity data for quote creation
var _selectedOpportunity = null;

function selectOpportunity(opp) {
    _selectedOpportunity = opp;

    // Store Airtable IDs
    document.getElementById('airtableOpportunityId').value = opp.id;
    document.getElementById('airtableContactId').value = opp.contact ? opp.contact.id : '';
    document.getElementById('airtableOpportunityName').value = opp.name || '';

    // Populate Sales Rep dropdown if available
    if (opp.salesRep && opp.salesRep.id) {
        var select = document.getElementById('salesRepSelect');
        select.value = opp.salesRep.id;
        updateSalesRepInfo();
    }

    // Show linked banner
    var banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.remove('hidden');
    banner.style.display = 'flex';
    document.getElementById('linkedOpportunityText').textContent = 'Linked to: ' + opp.name;

    // Enable create button
    var btn = document.getElementById('createFromOppBtn');
    btn.disabled = false;
    btn.style.opacity = '1';

    // Hide search results and clear search input
    document.getElementById('opportunitySearchResults').style.display = 'none';
    document.getElementById('opportunitySearch').value = '';
}

// Override unlinkOpportunity to disable the button
var _originalUnlinkOpportunity = typeof unlinkOpportunity === 'function' ? unlinkOpportunity : null;
function unlinkOpportunity() {
    _selectedOpportunity = null;
    document.getElementById('airtableOpportunityId').value = '';
    document.getElementById('airtableContactId').value = '';
    document.getElementById('airtableOpportunityName').value = '';

    var banner = document.getElementById('linkedOpportunityBanner');
    banner.classList.add('hidden');
    banner.style.display = 'none';

    var btn = document.getElementById('createFromOppBtn');
    btn.disabled = true;
    btn.style.opacity = '0.5';
}

async function createQuoteFromOpportunity() {
    var opp = _selectedOpportunity;
    if (!opp) {
        alert('Please search and select an opportunity first.');
        return;
    }

    var quoteId = Date.now().toString();
    var contact = opp.contact || {};

    var customerName = ((contact.firstName || '') + ' ' + (contact.lastName || '')).trim() || opp.name || 'Unnamed';
    var customerEmail = contact.email || '';
    var customerPhone = contact.phone || '';

    var quoteData = {
        id: quoteId,
        customerName: customerName,
        customerEmail: customerEmail,
        customerPhone: customerPhone,
        companyName: contact.companyName || '',
        streetAddress: contact.streetAddress || '',
        aptSuite: '',
        nearestIntersection: '',
        city: contact.city || '',
        state: contact.state || 'AZ',
        zipCode: contact.zipCode || '',
        screens: [],
        orderTotalPrice: 0,
        orderTotalMaterialsPrice: 0,
        orderTotalInstallationPrice: 0,
        orderTotalInstallationCost: 0,
        orderTotalWiringCost: 0,
        orderTotalWiringPrice: 0,
        orderTotalCost: 0,
        totalProfit: 0,
        marginPercent: 0,
        hasCableScreen: false,
        totalScreenCosts: 0,
        totalMotorCosts: 0,
        totalAccessoriesCosts: 0,
        totalCableSurcharge: 0,
        discountPercent: 0,
        discountLabel: '',
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
        miscInstallLabel: '',
        miscInstallAmount: 0,
        miscInstallCost: 0,
        projectAccessories: [],
        projectAccessoriesTotalPrice: 0,
        projectAccessoriesTotalCost: 0,
        airtableOpportunityId: opp.id,
        airtableContactId: contact.id || '',
        airtableOpportunityName: opp.name || '',
        internalComments: '',
        fourWeekGuarantee: false,
        totalGuaranteeDiscount: 0
    };

    // Include sales rep
    var salesRepSelect = document.getElementById('salesRepSelect');
    if (salesRepSelect && salesRepSelect.value) {
        var opt = salesRepSelect.selectedOptions[0];
        quoteData.salesRepId = salesRepSelect.value;
        quoteData.salesRepName = opt ? opt.textContent : '';
        quoteData.salesRepEmail = opt ? (opt.dataset.email || '') : '';
        quoteData.salesRepPhone = opt ? (opt.dataset.phone || '') : '';
    } else if (opp.salesRep) {
        quoteData.salesRepId = opp.salesRep.id || '';
        quoteData.salesRepName = opp.salesRep.name || '';
        quoteData.salesRepEmail = opp.salesRep.email || '';
        quoteData.salesRepPhone = opp.salesRep.phone || '';
    }

    try {
        var response = await fetch(WORKER_URL + '/api/save-quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        var result = await response.json();

        if (response.ok && result.success) {
            openQuote(quoteId);
        } else {
            alert('Failed to create quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error creating quote from opportunity:', error);
        alert('Failed to create quote. Check your internet connection.');
    }
}

// Also need selectManualEntry for airtable-search.js callback
function selectManualEntry() {
    unlinkOpportunity();
    document.getElementById('opportunitySearchResults').style.display = 'none';
    document.getElementById('opportunitySearch').value = '';
}
