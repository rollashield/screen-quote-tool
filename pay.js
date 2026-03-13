// ─── Payment Page Logic ─────────────────────────────────────────────────────
// Loaded on pay.html — fetches quote + payment info, populates the UI.
//
// URL params:
//   ?quoteId=<id>              — loads quote data for deposit amount + reference
//   &mode=in-person            — (optional) shows QR code button for iPad flow
//
// Data sources:
//   GET /api/quote/:id/customer-view  — quote details (amount, customer, quote number)
//   GET /api/payment-info             — static payment instructions (ACH, check, Zelle)
//   POST /api/quote/:id/create-clover-session — dynamic Clover Hosted Checkout session
//   POST /api/quote/:id/create-echeck-session — dynamic Stripe eCheck session
//   POST /api/quote/:id/select-payment-method — persist customer's payment method choice

// Map pay.html accordion keys → finalize.html dropdown values
const PAY_TO_FINALIZE_METHOD = {
    'card': 'credit-card',
    'echeck': 'echeck',
    'zelle': 'zelle',
    'financing': 'financing',
    'ach': 'ach-direct',
    'check': 'check'
};

let quoteId = null;
let quoteData = null;
let paymentMode = null; // 'in-person' or null (remote)
let paymentType = 'deposit'; // 'deposit' or 'full'
let storedTotalPrice = 0; // stored from populatePage for toggle
let selectedMethod = null; // tracks which payment method card is expanded

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    const params = new URLSearchParams(window.location.search);
    quoteId = params.get('quoteId') || sessionStorage.getItem('currentQuoteId');
    paymentMode = params.get('mode');

    // Persist for cross-page navigation
    if (quoteId) sessionStorage.setItem('currentQuoteId', quoteId);

    if (!quoteId) {
        showError('No quote ID provided. Please use the link from your signing confirmation.');
        return;
    }

    try {
        // Fetch quote data and payment info in parallel
        const [quoteResponse, paymentResponse] = await Promise.all([
            fetch(`${WORKER_URL}/api/quote/${quoteId}/customer-view`),
            fetch(`${WORKER_URL}/api/payment-info`)
        ]);

        if (!quoteResponse.ok) {
            showError('Unable to load quote details. The link may be invalid.');
            return;
        }

        const quoteResult = await quoteResponse.json();
        if (!quoteResult.success) {
            showError(quoteResult.error || 'Unable to load quote details.');
            return;
        }

        const paymentResult = await paymentResponse.json();
        if (!paymentResult.success) {
            showError('Unable to load payment information. Please try again later.');
            return;
        }

        quoteData = quoteResult;
        populatePage(quoteResult, paymentResult.paymentInfo);

    } catch (error) {
        console.error('Error loading payment page:', error);
        showError('Unable to connect to the server. Please check your internet connection.');
    }
}

// ─── Populate Page ──────────────────────────────────────────────────────────
function populatePage(quoteResult, paymentInfo) {
    // quoteResult.quote is the parsed order data (already stripped of internal fields)
    const orderData = quoteResult.quote;

    // Guard: block payment page for draft/unconfigured quotes
    const totalPrice = orderData.orderTotalPrice || 0;
    if (totalPrice === 0 || (orderData.screens || []).some(s => s.phase === 'opening')) {
        document.getElementById('loadingScreen').style.display = 'none';
        document.body.innerHTML = `
            <div style="text-align: center; padding: 60px 20px; font-family: 'Open Sans', sans-serif;">
                <h2 style="color: #c00;">Quote Not Ready</h2>
                <p>This quote has not been finalized yet. Please contact your sales representative.</p>
            </div>
        `;
        return;
    }
    storedTotalPrice = totalPrice;
    const depositAmount = totalPrice / 2;
    const customerName = orderData.customerName || 'Customer';
    const quoteNumber = quoteResult.quoteNumber || orderData.quoteNumber || 'N/A';

    // Header — populate both toggle buttons
    document.getElementById('depositAmountBtn').textContent = formatCurrency(depositAmount);
    document.getElementById('fullAmountBtn').textContent = formatCurrency(totalPrice);
    document.getElementById('quoteNumber').textContent = quoteNumber;
    document.getElementById('customerName').textContent = customerName;

    // Show QR buttons and navigation for in-person mode (sales rep iPad flow)
    if (paymentMode === 'in-person') {
        document.getElementById('cloverQrBtn').style.display = 'block';
        document.getElementById('echeckQrBtn').style.display = 'block';

        // Show navigation buttons
        const navButtons = document.getElementById('payNavButtons');
        if (navButtons) {
            navButtons.style.display = 'block';
            document.getElementById('payBackLink').href = `sign.html?quoteId=${quoteId}&mode=in-person`;
            document.getElementById('payNextLink').href = `finalize.html?quoteId=${quoteId}`;
        }
    }

    // ACH details
    document.getElementById('achBank').textContent = paymentInfo.ach.bank;
    document.getElementById('achHolder').textContent = paymentInfo.ach.accountHolder;
    document.getElementById('achRouting').textContent = paymentInfo.ach.routing || '(Contact us)';
    document.getElementById('achAccount').textContent = paymentInfo.ach.account || '(Contact us)';
    document.getElementById('achReference').textContent = quoteNumber;

    // Zelle
    document.getElementById('zelleUsername').textContent = paymentInfo.zelle.username;
    document.getElementById('zelleReference').textContent = quoteNumber;
    document.getElementById('zelleLimitNote').textContent = paymentInfo.zelle.limitNote;

    // Check
    document.getElementById('checkPayableTo').textContent = paymentInfo.check.payableTo;
    document.getElementById('checkAddress').textContent = paymentInfo.check.address;
    document.getElementById('checkMemo').textContent = quoteNumber;
    document.getElementById('checkWarning').textContent = paymentInfo.check.warning;

    // Show "Thanks for signing" banner if arriving from signature page
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('fromSignature') === '1') {
        const banner = document.createElement('div');
        banner.style.cssText = 'background: #d4edda; border: 1px solid #c3e6cb; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;';
        banner.innerHTML = `
            <div style="font-size: 1.5rem; margin-bottom: 4px;">✓</div>
            <strong style="color: #155724;">Thank you! Your signature has been submitted.</strong>
            <p style="color: #155724; margin-top: 4px; margin-bottom: 0;">Please select a payment method below to complete your order.</p>
        `;
        const payBody = document.querySelector('.pay-body');
        if (payBody) payBody.insertBefore(banner, payBody.firstChild);
    }

    // Financing plans — estimates from total price (always full amount, not deposit)
    const FINANCING_PLANS = [
        { name: 'Interest-Free', term: '18 months', apr: '0%*', factor: 0.03 },
        { name: 'Low Payment', term: '120 months', apr: 'As low as 9.99%', factor: 0.015 },
        { name: 'Extended', term: '180 months', apr: 'As low as 9.99%', factor: 0.0115 }
    ];
    const plansContainer = document.getElementById('financingPlans');
    if (plansContainer) {
        plansContainer.innerHTML = FINANCING_PLANS.map(plan => {
            const monthly = totalPrice * plan.factor;
            return `<div class="financing-plan">
                <div>
                    <strong>${plan.name}</strong><br>
                    <span style="color:#6b7280;font-size:12px;">${plan.term} &middot; ${plan.apr}</span>
                </div>
                <div class="plan-payment">~${formatCurrency(monthly)}/mo</div>
            </div>`;
        }).join('');
    }

    // Show the page
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('payContainer').style.display = 'block';
}

// ─── Payment Type Toggle ─────────────────────────────────────────────────────
function setPaymentType(type) {
    paymentType = type;
    document.getElementById('depositOption').classList.toggle('active', type === 'deposit');
    document.getElementById('fullOption').classList.toggle('active', type === 'full');
    document.getElementById('payIntro').textContent = type === 'deposit'
        ? 'Choose your preferred payment method below. Your 50% deposit secures your order.'
        : 'Choose your preferred payment method below to pay the full amount.';
    // Reset cached session URLs since amount changed
    echeckSessionUrl = null;
    cloverSessionUrl = null;
    // Update reference amounts on static payment methods
    updateReferenceAmounts();
}

function updateReferenceAmounts() {
    const amount = paymentType === 'deposit' ? storedTotalPrice / 2 : storedTotalPrice;
    const amountStr = formatCurrency(amount);
    const quoteNumber = document.getElementById('quoteNumber').textContent;

    // Update ACH reference
    document.getElementById('achReference').textContent = `${quoteNumber} — ${amountStr}`;
    // Update Zelle reference (if it has a reference element)
    const zelleRef = document.getElementById('zelleReference');
    if (zelleRef) zelleRef.textContent = `${quoteNumber} — ${amountStr}`;
    // Update Check memo
    document.getElementById('checkMemo').textContent = `${quoteNumber} — ${amountStr}`;
}

// ─── Select-then-reveal accordion ────────────────────────────────────────────
function selectMethod(methodKey) {
    // Collapse previously selected card
    if (selectedMethod && selectedMethod !== methodKey) {
        const prev = document.getElementById(selectedMethod + 'Actions');
        if (prev) prev.style.display = 'none';
        const prevCard = prev?.closest('.method-card');
        if (prevCard) prevCard.classList.remove('selected');
    }
    // Toggle current card
    const actions = document.getElementById(methodKey + 'Actions');
    const card = actions?.closest('.method-card');
    if (selectedMethod === methodKey) {
        // Collapse if clicking same card again
        if (actions) actions.style.display = 'none';
        if (card) card.classList.remove('selected');
        selectedMethod = null;
    } else {
        if (actions) actions.style.display = 'block';
        if (card) card.classList.add('selected');
        selectedMethod = methodKey;
    }

    // Persist selection to D1 so finalize page can pre-select the payment dropdown
    if (quoteId) {
        const mapped = selectedMethod ? (PAY_TO_FINALIZE_METHOD[selectedMethod] || null) : null;
        fetch(`${WORKER_URL}/api/quote/${quoteId}/select-payment-method`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method: mapped })
        }).catch(() => {}); // Non-critical, fire-and-forget
    }
}

// ─── Card Payment (Clover Hosted Checkout) ──────────────────────────────────
let cloverSessionUrl = null; // cached after first creation

async function handleCloverPay() {
    const btn = document.getElementById('cloverPayBtn');
    const errorEl = document.getElementById('cloverError');
    errorEl.style.display = 'none';

    // If we already have a session URL, just open it
    if (cloverSessionUrl) {
        window.open(cloverSessionUrl, '_blank');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating payment link...';

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/create-clover-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentType })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to create card payment session');
        }

        cloverSessionUrl = result.checkoutUrl;
        window.open(cloverSessionUrl, '_blank');
        btn.textContent = 'Pay with Card';
        btn.disabled = false;

    } catch (error) {
        console.error('Clover error:', error);
        errorEl.textContent = error.message || 'Unable to create payment link. Please try another method.';
        errorEl.style.display = 'block';
        btn.textContent = 'Pay with Card';
        btn.disabled = false;
    }
}

// ─── eCheck (Stripe ACH) ────────────────────────────────────────────────────
let echeckSessionUrl = null; // cached after first creation

async function handleEcheckPay() {
    const btn = document.getElementById('echeckPayBtn');
    const errorEl = document.getElementById('echeckError');
    errorEl.style.display = 'none';

    // If we already have a session URL, just open it
    if (echeckSessionUrl) {
        window.open(echeckSessionUrl, '_blank');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating payment link...';

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/create-echeck-session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentType })
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(result.error || 'Failed to create eCheck session');
        }

        echeckSessionUrl = result.checkoutUrl;
        window.open(echeckSessionUrl, '_blank');
        btn.textContent = 'Pay with eCheck';
        btn.disabled = false;

    } catch (error) {
        console.error('eCheck error:', error);
        errorEl.textContent = error.message || 'Unable to create payment link. Please try another method.';
        errorEl.style.display = 'block';
        btn.textContent = 'Pay with eCheck';
        btn.disabled = false;
    }
}

async function showEcheckQrModal() {
    const btn = document.getElementById('echeckQrBtn');
    const errorEl = document.getElementById('echeckError');
    errorEl.style.display = 'none';

    // Create session if we don't have one yet
    if (!echeckSessionUrl) {
        btn.disabled = true;
        btn.textContent = 'Creating payment link...';

        try {
            const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/create-echeck-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentType })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to create eCheck session');
            }

            echeckSessionUrl = result.checkoutUrl;
            btn.textContent = 'Show QR Code (Customer Scans to Pay)';
            btn.disabled = false;

        } catch (error) {
            console.error('eCheck QR error:', error);
            errorEl.textContent = error.message || 'Unable to create payment link.';
            errorEl.style.display = 'block';
            btn.textContent = 'Show QR Code (Customer Scans to Pay)';
            btn.disabled = false;
            return;
        }
    }

    // Show QR modal with the eCheck URL
    const qrImg = document.getElementById('qrCodeImage');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(echeckSessionUrl)}`;
    document.getElementById('qrModalOverlay').classList.add('active');
}

// ─── QR Code Modal (Clover) ─────────────────────────────────────────────────
async function showQrModal() {
    const btn = document.getElementById('cloverQrBtn');
    const errorEl = document.getElementById('cloverError');
    if (errorEl) errorEl.style.display = 'none';

    // Create session if we don't have one yet
    if (!cloverSessionUrl) {
        btn.disabled = true;
        btn.textContent = 'Creating payment link...';

        try {
            const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/create-clover-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentType })
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.error || 'Failed to create card payment session');
            }

            cloverSessionUrl = result.checkoutUrl;
            btn.textContent = 'Show QR Code (Customer Scans to Pay)';
            btn.disabled = false;

        } catch (error) {
            console.error('Clover QR error:', error);
            if (errorEl) {
                errorEl.textContent = error.message || 'Unable to create payment link.';
                errorEl.style.display = 'block';
            }
            btn.textContent = 'Show QR Code (Customer Scans to Pay)';
            btn.disabled = false;
            return;
        }
    }

    // Show QR modal with the Clover checkout URL
    const qrImg = document.getElementById('qrCodeImage');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(cloverSessionUrl)}`;
    document.getElementById('qrModalOverlay').classList.add('active');
}

function showZelleQrModal() {
    const qrImg = document.getElementById('qrCodeImage');
    qrImg.src = 'assets/zelle-qr.png';
    document.getElementById('qrModalOverlay').classList.add('active');
}

function closeQrModal(event) {
    // If called from overlay click, only close if clicking the overlay itself
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('qrModalOverlay').classList.remove('active');
}

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'flex';
    document.getElementById('errorMessage').textContent = message;
}
