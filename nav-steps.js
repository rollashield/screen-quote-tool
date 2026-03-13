/**
 * nav-steps.js
 * Builds a contextual step indicator bar and quote header bar for all pages.
 *
 * Sales rep flow: Quotes → Editor → Signature → Payment → Finalize
 * Customer (remote): Review & Sign → Payment
 *
 * The quote header bar shows customer name, quote number, status badge,
 * and a "Save & Exit" button. It also provides share links (Feature 2).
 */

(function () {
    var params = new URLSearchParams(window.location.search);
    var quoteId = params.get('quoteId') || params.get('orderId') || sessionStorage.getItem('currentQuoteId');
    var mode = params.get('mode');
    var token = params.get('token');

    // Determine current page
    var path = window.location.pathname;
    var currentPage = path.includes('quotes.') ? 'quotes'
        : path.includes('sign.') ? 'sign'
        : path.includes('pay.') ? 'pay'
        : path.includes('finalize.') ? 'finalize'
        : path.includes('index.') || path.endsWith('/') ? 'editor'
        : null;

    // Customer-facing pages (via token, no quoteId) get a minimal 2-step nav
    var isCustomerFacing = !!token && !mode;

    if (!currentPage) return;

    // Store quoteId in sessionStorage for cross-page persistence
    if (quoteId) {
        sessionStorage.setItem('currentQuoteId', quoteId);
    }

    // ── Step definitions ──
    var steps = [];

    if (isCustomerFacing) {
        // Customer: 2 steps
        steps.push({
            key: 'sign',
            label: 'Review & Sign',
            url: token ? 'sign.html?token=' + token : (quoteId ? 'sign.html?quoteId=' + quoteId : null)
        });
        steps.push({
            key: 'pay',
            label: 'Payment',
            url: quoteId ? 'pay.html?quoteId=' + quoteId : null
        });
    } else {
        // Sales rep: 5 steps, all always linked (free navigation)
        steps.push({
            key: 'quotes',
            label: 'Quotes',
            url: 'quotes.html'
        });
        steps.push({
            key: 'editor',
            label: 'Editor',
            url: quoteId ? 'index.html?quoteId=' + quoteId : 'index.html'
        });
        steps.push({
            key: 'sign',
            label: 'Signature',
            url: quoteId ? 'sign.html?quoteId=' + quoteId + '&mode=in-person' : null
        });
        steps.push({
            key: 'pay',
            label: 'Payment',
            url: quoteId ? 'pay.html?quoteId=' + quoteId + '&mode=in-person' : null
        });
        steps.push({
            key: 'finalize',
            label: 'Finalize',
            url: quoteId ? 'finalize.html?quoteId=' + quoteId : null
        });
    }

    // ── Build step nav ──
    var container = document.getElementById('stepNav');
    if (container) {
        var nav = document.createElement('nav');
        nav.className = 'step-nav';
        nav.setAttribute('aria-label', 'Progress');

        var stepOrder = steps.map(function (s) { return s.key; });
        var currentIndex = stepOrder.indexOf(currentPage);

        steps.forEach(function (step, i) {
            var isActive = step.key === currentPage;
            var isCompleted = i < currentIndex;
            // Free navigation: all steps with URLs are clickable (not just completed ones)
            var hasLink = step.url && !isActive;

            var el = document.createElement(hasLink ? 'a' : 'span');
            el.className = 'step-nav__step';
            if (isActive) el.classList.add('step-nav__step--active');
            if (isCompleted) el.classList.add('step-nav__step--completed');
            if (!hasLink && !isActive) el.classList.add('step-nav__step--disabled');
            if (hasLink) el.href = step.url;

            var circle = document.createElement('span');
            circle.className = 'step-nav__circle';
            if (isCompleted) {
                circle.innerHTML = '&#10003;';
            } else {
                circle.textContent = i + 1;
            }
            el.appendChild(circle);

            var label = document.createElement('span');
            label.className = 'step-nav__label';
            label.textContent = step.label;
            el.appendChild(label);

            nav.appendChild(el);

            if (i < steps.length - 1) {
                var connector = document.createElement('span');
                connector.className = 'step-nav__connector';
                if (isCompleted) connector.classList.add('step-nav__connector--completed');
                nav.appendChild(connector);
            }
        });

        container.appendChild(nav);
    }

    // ── Quote Header Bar (sales rep pages only) ──
    if (isCustomerFacing || !quoteId) return;

    var headerBar = document.getElementById('quoteHeaderBar');
    if (!headerBar) return;

    // Fetch quote summary data
    var workerUrl = typeof WORKER_URL !== 'undefined' ? WORKER_URL : 'https://rollashield-quote-worker.derek-44b.workers.dev';

    fetch(workerUrl + '/api/quote/' + quoteId + '/customer-view')
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (!result.success) return;
            var q = result.quote || {};
            renderHeaderBar(headerBar, q, quoteId, workerUrl);
        })
        .catch(function (err) {
            console.error('Failed to load quote header:', err);
        });
})();

/**
 * Render the quote header bar with customer info, status, and actions.
 */
function renderHeaderBar(container, quote, quoteId, workerUrl) {
    var customerName = quote.customerName || 'Unnamed';
    var quoteNumber = quote.quoteNumber || '';
    var quoteStatus = quote.quoteStatus || 'draft';
    var paymentStatus = quote.paymentStatus || 'unpaid';

    // Status badge
    var badgeClass = '';
    var badgeText = '';
    if (paymentStatus === 'paid') {
        badgeClass = 'header-badge--paid'; badgeText = 'PAID';
    } else if (quoteStatus === 'signed') {
        badgeClass = 'header-badge--signed'; badgeText = 'SIGNED';
    } else if (quoteStatus === 'sent') {
        badgeClass = 'header-badge--sent'; badgeText = 'SENT';
    } else {
        badgeClass = 'header-badge--draft'; badgeText = 'DRAFT';
    }

    var html = '';
    html += '<div class="quote-header-bar">';
    html += '  <div class="quote-header-bar__info">';
    html += '    <span class="quote-header-bar__name">' + escapeHtmlNav(customerName) + '</span>';
    if (quoteNumber) {
        html += '    <span class="quote-header-bar__number">#' + escapeHtmlNav(quoteNumber) + '</span>';
    }
    html += '    <span class="header-badge ' + badgeClass + '">' + badgeText + '</span>';
    html += '  </div>';
    html += '  <div class="quote-header-bar__actions">';
    html += '    <button class="header-share-btn" onclick="toggleShareLinks()" title="Share Links">&#128279; Share</button>';
    html += '    <button class="header-exit-btn" onclick="' + (typeof saveAndExit === 'function' ? 'saveAndExit()' : 'window.location.href=\'quotes.html\'') + '">Save & Exit</button>';
    html += '  </div>';
    html += '</div>';

    // Share links dropdown (hidden by default)
    html += '<div id="shareLinksDropdown" class="share-links-dropdown" style="display: none;">';
    html += '  <div class="share-links-row">';
    html += '    <label>Signing Link:</label>';
    html += '    <input type="text" id="signingLinkInput" readonly placeholder="Click to generate...">';
    html += '    <button onclick="copyShareLink(\'signingLinkInput\')" class="copy-btn">Copy</button>';
    html += '  </div>';
    html += '  <div class="share-links-row">';
    html += '    <label>Payment Link:</label>';
    html += '    <input type="text" id="paymentLinkInput" readonly value="' + window.location.origin + '/pay.html?quoteId=' + quoteId + '">';
    html += '    <button onclick="copyShareLink(\'paymentLinkInput\')" class="copy-btn">Copy</button>';
    html += '  </div>';
    html += '</div>';

    container.innerHTML = html;

    // Store quoteId and workerUrl for share link functions
    container.dataset.quoteId = quoteId;
    container.dataset.workerUrl = workerUrl;
}

// ── Share Links (Feature 2) ──

var _shareLinksVisible = false;
var _signingTokenGenerated = false;

function toggleShareLinks() {
    var dropdown = document.getElementById('shareLinksDropdown');
    if (!dropdown) return;

    _shareLinksVisible = !_shareLinksVisible;
    dropdown.style.display = _shareLinksVisible ? 'block' : 'none';

    // Auto-generate signing token on first open
    if (_shareLinksVisible && !_signingTokenGenerated) {
        generateSigningLink();
    }
}

function generateSigningLink() {
    var headerBar = document.getElementById('quoteHeaderBar');
    var quoteId = headerBar ? headerBar.dataset.quoteId : null;
    var workerUrl = headerBar ? headerBar.dataset.workerUrl : '';
    var input = document.getElementById('signingLinkInput');

    if (!quoteId || !input) return;

    input.value = 'Generating...';

    fetch(workerUrl + '/api/quote/' + quoteId + '/generate-token', { method: 'POST' })
        .then(function (res) { return res.json(); })
        .then(function (result) {
            if (result.success && result.token) {
                input.value = window.location.origin + '/sign.html?token=' + result.token;
                _signingTokenGenerated = true;
            } else {
                input.value = 'Failed to generate link';
            }
        })
        .catch(function () {
            input.value = 'Error generating link';
        });
}

function copyShareLink(inputId) {
    var input = document.getElementById(inputId);
    if (!input || !input.value || input.value.includes('Generating') || input.value.includes('Failed') || input.value.includes('Error')) return;

    navigator.clipboard.writeText(input.value).then(function () {
        var btn = input.nextElementSibling;
        var orig = btn.textContent;
        btn.textContent = 'Copied!';
        btn.style.background = '#28a745';
        setTimeout(function () {
            btn.textContent = orig;
            btn.style.background = '';
        }, 2000);
    });
}

// ── Utility ──
function escapeHtmlNav(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
