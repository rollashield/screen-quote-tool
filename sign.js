/**
 * sign.js
 * Customer-facing signing page logic.
 * Handles both in-person (quoteId + mode=in-person) and remote (token) flows.
 */

let signaturePad = null;
let signingMode = null; // 'in-person' or 'remote'
let quoteId = null;
let signingToken = null;

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    signingToken = params.get('token');
    quoteId = params.get('quoteId');
    signingMode = params.get('mode') || 'remote';

    if (!signingToken && !quoteId) {
        showError('Invalid link. No quote identifier provided.');
        return;
    }

    try {
        let data;
        if (signingToken) {
            signingMode = 'remote';
            data = await fetchRemoteQuote(signingToken);
        } else {
            signingMode = 'in-person';
            data = await fetchInPersonQuote(quoteId);
        }

        if (!data) return; // Error already shown

        // Capture quoteId from API response (needed for payment link in remote flow)
        if (data.quoteId) {
            quoteId = data.quoteId;
        }

        renderQuote(data);
        handleSignedState(data);
        initSignaturePad();
        setupFormValidation();

    } catch (error) {
        console.error('Error loading signing page:', error);
        showError('Failed to load quote. Please try again or contact Roll-A-Shield.');
    }
});

// ─── API Calls ───────────────────────────────────────────────────────────────
async function fetchRemoteQuote(token) {
    const response = await fetch(`${WORKER_URL}/api/sign/${token}`);
    const result = await response.json();

    if (response.status === 410) {
        showExpired();
        return null;
    }

    if (!response.ok || !result.success) {
        showError(result.error || 'Unable to load this quote.');
        return null;
    }

    return result;
}

async function fetchInPersonQuote(id) {
    const response = await fetch(`${WORKER_URL}/api/quote/${id}/customer-view`);
    const result = await response.json();

    if (!response.ok || !result.success) {
        showError(result.error || 'Quote not found.');
        return null;
    }

    return result;
}

// ─── Render Quote ────────────────────────────────────────────────────────────
function renderQuote(data) {
    const quoteData = data.quote;
    const templateData = mapOrderDataForSigning(quoteData, data.quoteNumber);
    const htmlString = generateQuotePDF(templateData);

    // Parse the HTML and extract the .page content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const page = doc.querySelector('.page');

    if (page) {
        // Remove the static signature/payment block (the dashed-border section)
        const signatureBlock = page.querySelector('[style*="dashed"]');
        if (signatureBlock) {
            signatureBlock.remove();
        }

        document.getElementById('quoteContent').appendChild(page);
    }

    // Show the container
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('signContainer').style.display = 'block';
}

// ─── Data Mapping (similar to app.js mapOrderDataToTemplate but for customer view) ─
function mapOrderDataForSigning(quoteData, quoteNumber) {
    const address = [
        quoteData.streetAddress,
        quoteData.aptSuite,
        [quoteData.city, quoteData.state, quoteData.zipCode].filter(Boolean).join(', ')
    ].filter(Boolean).join(', ');

    const screens = (quoteData.screens || []).map((screen, i) => ({
        name: screen.screenName || `Screen ${i + 1}`,
        track: clientFacingTrackName(screen.trackTypeName || ''),
        operator: clientFacingOperatorName(screen.operatorType, screen.operatorTypeName),
        fabric: screen.fabricColorName || '',
        frame: screen.frameColorName || '',
        width: screen.actualWidthDisplay || '',
        height: screen.actualHeightDisplay || '',
        price1: (screen.customerPrice || 0) - (screen.installationPrice || 0),
        price2: screen.comparisonMaterialPrice || null
    }));

    const materialsPrice = quoteData.orderTotalMaterialsPrice || 0;
    const installationPrice = quoteData.orderTotalInstallationPrice || 0;
    const discountPercent = quoteData.discountPercent || 0;
    const discountAmount = quoteData.discountAmount || 0;
    const subtotal = (discountPercent > 0 ? quoteData.discountedMaterialsPrice : materialsPrice) + installationPrice;
    const total = quoteData.orderTotalPrice || 0;

    const data = {
        customer: {
            name: quoteData.customerName || '',
            company: quoteData.companyName || undefined,
            address: address,
            email: quoteData.customerEmail || '',
            phone: quoteData.customerPhone || ''
        },
        salesRep: {
            name: quoteData.salesRepName || '',
            email: quoteData.salesRepEmail || '',
            phone: quoteData.salesRepPhone || ''
        },
        quote: {
            number: quoteNumber || quoteData.quoteNumber || 'DRAFT',
            date: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
            validThrough: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        },
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

    if (quoteData.enableComparison) {
        const compMaterials = quoteData.comparisonTotalMaterialsPrice || 0;
        const compDiscounted = quoteData.comparisonDiscountedMaterialsPrice || compMaterials;
        const compSubtotal = (discountPercent > 0 ? compDiscounted : compMaterials) + installationPrice;
        const compTotal = quoteData.comparisonTotalPrice || 0;

        data.comparisonPricing = {
            option1Label: 'Option 1',
            option2Label: 'Option 2',
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

// Simplified client-facing name helpers (copies from app.js since sign.js is standalone)
function clientFacingOperatorName(operatorType, operatorTypeName) {
    if (operatorType === 'gear') return 'Manual Gear Operation';
    if (operatorType === 'gaposa-rts' || operatorType === 'somfy-rts') return 'Remote-Operated Motor';
    if (operatorType === 'gaposa-solar') return 'Solar Motor';
    return operatorTypeName || operatorType || '';
}

function clientFacingTrackName(trackTypeName) {
    return (trackTypeName || '').replace('Sunair ', '').replace('Fenetex ', '');
}

// ─── Signed State ────────────────────────────────────────────────────────────
function handleSignedState(data) {
    if (data.alreadySigned) {
        // Hide interactive signature section, show read-only view
        document.getElementById('signatureSection').style.display = 'none';
        const signedView = document.getElementById('signedView');
        signedView.style.display = 'block';

        document.getElementById('signedByName').textContent = data.signerName || 'Customer';
        document.getElementById('signedOnDate').textContent = data.signedAt
            ? new Date(data.signedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
            : 'N/A';

        if (data.signatureData) {
            const img = document.createElement('img');
            img.src = data.signatureData;
            img.alt = 'Customer signature';
            document.getElementById('signedSignatureDisplay').appendChild(img);
        }
    }
}

// ─── Signature Pad ───────────────────────────────────────────────────────────
function initSignaturePad() {
    const canvas = document.getElementById('signatureCanvas');
    if (!canvas) return;

    // Set canvas resolution for retina displays
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    signaturePad = new SignaturePad(canvas, {
        backgroundColor: 'rgb(255, 255, 255)',
        penColor: 'rgb(0, 0, 0)',
        minWidth: 1,
        maxWidth: 3
    });

    // Hide placeholder when drawing starts
    signaturePad.addEventListener('beginStroke', () => {
        document.getElementById('canvasPlaceholder').style.display = 'none';
        validateForm();
    });

    signaturePad.addEventListener('endStroke', () => {
        validateForm();
    });

    // Handle window resize
    window.addEventListener('resize', () => {
        const data = signaturePad.toData();
        const rect = canvas.getBoundingClientRect();
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        canvas.width = rect.width * ratio;
        canvas.height = rect.height * ratio;
        canvas.getContext('2d').scale(ratio, ratio);
        signaturePad.clear();
        signaturePad.fromData(data);
    });
}

function clearSignature() {
    if (signaturePad) {
        signaturePad.clear();
        document.getElementById('canvasPlaceholder').style.display = 'block';
        validateForm();
    }
}

function undoSignature() {
    if (signaturePad) {
        const data = signaturePad.toData();
        if (data.length > 0) {
            data.pop();
            signaturePad.fromData(data);
            if (data.length === 0) {
                document.getElementById('canvasPlaceholder').style.display = 'block';
            }
            validateForm();
        }
    }
}

// ─── Form Validation ─────────────────────────────────────────────────────────
function setupFormValidation() {
    document.getElementById('acceptCheckbox').addEventListener('change', validateForm);
    document.getElementById('signerName').addEventListener('input', validateForm);
}

function validateForm() {
    const accepted = document.getElementById('acceptCheckbox').checked;
    const name = document.getElementById('signerName').value.trim();
    const hasSig = signaturePad && !signaturePad.isEmpty();

    const btn = document.getElementById('submitBtn');
    btn.disabled = !(accepted && name && hasSig);
}

// ─── Submit Signature ────────────────────────────────────────────────────────
async function submitSignature() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const signerName = document.getElementById('signerName').value.trim();
    const signatureData = signaturePad.toDataURL('image/png');

    try {
        let url;
        if (signingMode === 'remote' && signingToken) {
            url = `${WORKER_URL}/api/sign/${signingToken}`;
        } else {
            url = `${WORKER_URL}/api/quote/${quoteId}/sign-in-person`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatureData, signerName })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            // Capture quoteId from response (remote flow may not have it from URL)
            if (result.quoteId) {
                quoteId = result.quoteId;
            }
            showConfirmation();
        } else {
            alert('Failed to submit signature: ' + (result.error || 'Unknown error'));
            btn.disabled = false;
            btn.textContent = 'Accept & Sign';
        }
    } catch (error) {
        console.error('Error submitting signature:', error);
        alert('Failed to submit signature. Please check your internet connection and try again.');
        btn.disabled = false;
        btn.textContent = 'Accept & Sign';
    }
}

// ─── UI State Helpers ────────────────────────────────────────────────────────
function showConfirmation() {
    document.getElementById('signatureSection').style.display = 'none';
    const confirmScreen = document.getElementById('confirmationScreen');
    confirmScreen.style.display = 'block';

    // Build the payment page URL
    const paymentUrl = quoteId
        ? `pay.html?quoteId=${quoteId}${signingMode === 'in-person' ? '&mode=in-person' : ''}`
        : null;

    // Show payment link for all modes
    if (paymentUrl) {
        document.getElementById('paymentLink').href = paymentUrl;
        document.getElementById('paymentLinkContainer').style.display = 'block';
    }

    // Show additional navigation links for in-person mode (sales rep needs them)
    if (signingMode === 'in-person' && quoteId) {
        const linksDiv = document.getElementById('confirmationLinks');
        linksDiv.style.display = 'flex';
        document.getElementById('finalizeLink').href = `finalize.html?orderId=${quoteId}`;
    }
}

function showError(message) {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('errorScreen').style.display = 'flex';
    document.getElementById('errorMessage').textContent = message;
}

function showExpired() {
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('expiredScreen').style.display = 'flex';
}
