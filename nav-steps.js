/**
 * nav-steps.js
 * Builds a contextual step indicator bar for sign, pay, and finalize pages.
 *
 * Sales rep (mode=in-person): Quote → Signature → Payment → Finalize
 * Customer (remote):          Review & Sign → Payment
 */

(function () {
    const params = new URLSearchParams(window.location.search);
    const quoteId = params.get('quoteId') || params.get('orderId');
    const mode = params.get('mode');
    const token = params.get('token');

    // Determine current page
    const path = window.location.pathname;
    const currentPage = path.includes('sign.') ? 'sign'
        : path.includes('pay.') ? 'pay'
        : path.includes('finalize.') ? 'finalize'
        : null;

    // Finalize page is always in-person (sales rep only)
    const isInPerson = mode === 'in-person' || currentPage === 'finalize';

    if (!currentPage) return;

    // Define step flow based on audience
    const steps = [];

    if (isInPerson) {
        // Sales rep: 4 steps
        steps.push({
            key: 'quote',
            label: 'Quote',
            url: 'index.html'
        });
        steps.push({
            key: 'sign',
            label: 'Signature',
            url: quoteId ? `sign.html?quoteId=${quoteId}&mode=in-person` : null
        });
        steps.push({
            key: 'pay',
            label: 'Payment',
            url: quoteId ? `pay.html?quoteId=${quoteId}&mode=in-person` : null
        });
        steps.push({
            key: 'finalize',
            label: 'Finalize',
            url: quoteId ? `finalize.html?orderId=${quoteId}` : null
        });
    } else {
        // Customer: 2 steps
        steps.push({
            key: 'sign',
            label: 'Review & Sign',
            url: token ? `sign.html?token=${token}` : (quoteId ? `sign.html?quoteId=${quoteId}` : null)
        });
        steps.push({
            key: 'pay',
            label: 'Payment',
            url: quoteId ? `pay.html?quoteId=${quoteId}` : null
        });
    }

    // Determine step order for active/completed logic
    const stepOrder = steps.map(s => s.key);
    const currentIndex = stepOrder.indexOf(currentPage);

    // Build HTML
    const container = document.getElementById('stepNav');
    if (!container) return;

    const nav = document.createElement('nav');
    nav.className = 'step-nav';
    nav.setAttribute('aria-label', 'Progress');

    steps.forEach((step, i) => {
        // Determine state
        const isActive = step.key === currentPage;
        const isCompleted = i < currentIndex;
        const hasLink = step.url && !isActive;

        // Step element
        const el = document.createElement(hasLink ? 'a' : 'span');
        el.className = 'step-nav__step';
        if (isActive) el.classList.add('step-nav__step--active');
        if (isCompleted) el.classList.add('step-nav__step--completed');
        if (!hasLink && !isActive) el.classList.add('step-nav__step--disabled');
        if (hasLink) el.href = step.url;

        // Circle with number or checkmark
        const circle = document.createElement('span');
        circle.className = 'step-nav__circle';
        if (isCompleted) {
            circle.innerHTML = '&#10003;'; // checkmark
        } else {
            circle.textContent = i + 1;
        }
        el.appendChild(circle);

        // Label
        const label = document.createElement('span');
        label.className = 'step-nav__label';
        label.textContent = step.label;
        el.appendChild(label);

        nav.appendChild(el);

        // Connector (except after last step)
        if (i < steps.length - 1) {
            const connector = document.createElement('span');
            connector.className = 'step-nav__connector';
            if (isCompleted) connector.classList.add('step-nav__connector--completed');
            nav.appendChild(connector);
        }
    });

    container.appendChild(nav);
})();
