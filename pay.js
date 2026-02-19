// ─── Payment Page Logic ─────────────────────────────────────────────────────
// Loaded on pay.html — fetches quote + payment info, populates the UI.
//
// URL params:
//   ?quoteId=<id>              — loads quote data for deposit amount + reference
//   &mode=in-person            — (optional) shows QR code button for iPad flow
//
// Data sources:
//   GET /api/quote/:id/customer-view  — quote details (amount, customer, quote number)
//   GET /api/payment-info             — static payment instructions (ACH, check, Zelle, Clover)

let quoteId = null;
let quoteData = null;
let paymentMode = null; // 'in-person' or null (remote)

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

async function init() {
    const params = new URLSearchParams(window.location.search);
    quoteId = params.get('quoteId');
    paymentMode = params.get('mode');

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

    const totalPrice = orderData.orderTotalPrice || 0;
    const depositAmount = totalPrice / 2;
    const customerName = orderData.customerName || 'Customer';
    const quoteNumber = quoteResult.quoteNumber || orderData.quoteNumber || 'N/A';

    // Header
    document.getElementById('depositAmount').textContent = formatCurrency(depositAmount);
    document.getElementById('quoteNumber').textContent = quoteNumber;
    document.getElementById('customerName').textContent = customerName;

    // Card payment — Clover permanent link
    const cloverLink = paymentInfo.clover.permanentPaymentLink;
    const cloverPayLink = document.getElementById('cloverPayLink');
    cloverPayLink.href = cloverLink;

    // Show QR buttons and navigation for in-person mode (sales rep iPad flow)
    if (paymentMode === 'in-person') {
        document.getElementById('cloverQrBtn').style.display = 'block';
        document.getElementById('echeckQrBtn').style.display = 'block';

        // Show navigation buttons
        const navButtons = document.getElementById('payNavButtons');
        if (navButtons) {
            navButtons.style.display = 'block';
            document.getElementById('payBackLink').href = `sign.html?quoteId=${quoteId}&mode=in-person`;
            document.getElementById('payNextLink').href = `finalize.html?orderId=${quoteId}`;
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

    // Show the page
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('payContainer').style.display = 'block';
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
            method: 'POST'
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
                method: 'POST'
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
function showQrModal() {
    const cloverLink = document.getElementById('cloverPayLink').href;
    const qrImg = document.getElementById('qrCodeImage');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(cloverLink)}`;
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
