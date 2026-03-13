/**
 * sign.js
 * Customer-facing signing page logic.
 * Handles both in-person (quoteId + mode=in-person) and remote (token) flows.
 */

let signaturePad = null;
let signingMode = null; // 'in-person' or 'remote'
let quoteId = null;
let signingToken = null;
let cachedQuoteData = null;   // Cached for signed PDF generation
let cachedQuoteNumber = null; // Cached for signed PDF generation

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    signingToken = params.get('token');
    quoteId = params.get('quoteId') || sessionStorage.getItem('currentQuoteId');
    signingMode = params.get('mode') || 'remote';

    // Persist for cross-page navigation
    if (quoteId) sessionStorage.setItem('currentQuoteId', quoteId);

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
    cachedQuoteData = quoteData;
    cachedQuoteNumber = data.quoteNumber;

    // Guard: block rendering for draft/unconfigured quotes (skip excluded screens)
    const unconfigured = (quoteData.screens || []).filter(s => s.phase === 'opening' && !s.excluded);
    if (unconfigured.length > 0) {
        document.getElementById('loadingScreen').style.display = 'none';
        document.getElementById('signContainer').style.display = 'block';
        document.getElementById('quoteContent').innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: #c00;">
                <h2>Quote Not Ready</h2>
                <p>This quote is still in draft — ${unconfigured.length} opening(s) need product configuration.</p>
                <p>Please ask your sales representative to complete the configuration before signing.</p>
            </div>
        `;
        return;
    }

    const templateData = mapOrderDataForSigning(quoteData, data.quoteNumber);

    // Render quote as styled HTML (replaces PDF iframe for tablet compatibility)
    const quoteContent = document.getElementById('quoteContent');
    quoteContent.innerHTML = renderQuoteHtml(templateData);

    // Add "Download PDF" button below HTML preview (generates on-demand via pdfmake)
    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'qh-download-btn';
    downloadBtn.textContent = 'Download PDF';
    downloadBtn.addEventListener('click', function() {
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Generating PDF...';
        try {
            const docDefinition = generateQuotePDF(templateData);
            pdfMake.createPdf(docDefinition).download('Roll-A-Shield-Quote.pdf', function() {
                downloadBtn.disabled = false;
                downloadBtn.textContent = 'Download PDF';
            });
        } catch (err) {
            console.error('PDF download failed:', err);
            alert('Failed to generate PDF. Please try again.');
            downloadBtn.disabled = false;
            downloadBtn.textContent = 'Download PDF';
        }
    });
    quoteContent.appendChild(downloadBtn);

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

    const screens = (quoteData.screens || []).filter(s => !s.excluded).map((screen, i) => ({
        name: screen.screenName || `Screen ${i + 1}`,
        track: clientFacingTrackName(screen.trackTypeName || ''),
        operator: clientFacingOperatorName(screen.operatorType, screen.operatorTypeName),
        fabric: screen.fabricColorName || '',
        frame: screen.frameColorName || '',
        width: screen.actualWidthDisplay || '',
        height: screen.actualHeightDisplay || '',
        price1: (screen.customerPrice || 0) - (screen.installationPrice || 0) - (screen.wiringPrice || 0),
        price2: screen.comparisonMaterialPrice != null ? screen.comparisonMaterialPrice : null,
        installPrice: screen.installationPrice || 0
    }));

    const materialsPrice = quoteData.orderTotalMaterialsPrice || 0;
    const installationPrice = quoteData.orderTotalInstallationPrice || 0;
    const wiringPrice = quoteData.orderTotalWiringPrice || 0;
    const miscInstallAmount = quoteData.miscInstallAmount || 0;
    const discountPercent = quoteData.discountPercent || 0;
    const discountAmount = quoteData.discountAmount || 0;
    const subtotal = (discountPercent > 0 ? quoteData.discountedMaterialsPrice : materialsPrice) + installationPrice + wiringPrice + miscInstallAmount;
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
            validThrough: new Date(Date.now() + ((quoteData.fourWeekGuarantee ? 1 : 30) * 24 * 60 * 60 * 1000)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        },
        screens: screens,
        projectAccessories: (quoteData.projectAccessories || []).filter(a => a.quantity > 0).map(acc => ({
            name: acc.name,
            quantity: acc.quantity,
            unitPrice: acc.customerPrice,
            lineTotal: acc.customerPrice * acc.quantity
        })),
        pricing: {
            materials: materialsPrice,
            installation: installationPrice,
            wiring: wiringPrice,
            miscInstallLabel: quoteData.miscInstallLabel || '',
            miscInstallAmount: miscInstallAmount,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            subtotal: subtotal,
            tax: 0,
            total: total,
            deposit: total / 2,
            balance: total / 2,
            guaranteeDiscount: quoteData.totalGuaranteeDiscount || 0,
            fourWeekGuarantee: quoteData.fourWeekGuarantee || false
        },
        comparisonPricing: null
    };

    const hasComparison = quoteData.enableComparison && (
        (quoteData.comparisonType === 'track' && quoteData.comparisonTrack) ||
        ((!quoteData.comparisonType || quoteData.comparisonType === 'motor') && quoteData.comparisonMotor)
    );
    if (hasComparison) {
        const compMaterials = quoteData.comparisonTotalMaterialsPrice || 0;
        const compDiscounted = quoteData.comparisonDiscountedMaterialsPrice || compMaterials;
        const compSubtotal = (discountPercent > 0 ? compDiscounted : compMaterials) + installationPrice + wiringPrice + miscInstallAmount;
        const compTotal = quoteData.comparisonTotalPrice || 0;

        const firstScreen = (quoteData.screens || []).filter(s => !s.excluded)[0];
        let option1Label, option2Label;
        if (quoteData.comparisonType === 'track') {
            option1Label = firstScreen
                ? clientFacingTrackName(firstScreen.trackTypeName)
                : 'Option 1';
            option2Label = quoteData.comparisonTrackName
                ? clientFacingTrackName(quoteData.comparisonTrackName)
                : 'Option 2';
        } else {
            option1Label = firstScreen
                ? clientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName)
                : 'Option 1';
            option2Label = quoteData.comparisonMotor
                ? clientFacingOperatorName(quoteData.comparisonMotor, quoteData.comparisonMotor)
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

        // Show payment link for already-signed quotes
        if (quoteId) {
            const paymentUrl = `pay.html?quoteId=${quoteId}${signingMode === 'in-person' ? '&mode=in-person' : ''}`;
            document.getElementById('signedPaymentLink').href = paymentUrl;
            document.getElementById('signedPaymentLinkContainer').style.display = 'block';

            // Show additional nav for in-person mode
            if (signingMode === 'in-person') {
                const linksDiv = document.getElementById('signedConfirmationLinks');
                linksDiv.style.display = 'flex';
                document.getElementById('signedFinalizeLink').href = `finalize.html?quoteId=${quoteId}`;
            }
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

// ─── Signed PDF Generation ──────────────────────────────────────────────────
function generateSignedPdf(quoteData, quoteNumber, signatureDataUrl, signerName) {
    return new Promise((resolve, reject) => {
        try {
            const templateData = mapOrderDataForSigning(quoteData, quoteNumber);
            const docDefinition = generateQuotePDF(templateData);

            // Append signature block to the PDF content (before footer bar)
            const signedDate = new Date().toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            });

            // Replace the blank signature area with the actual signature
            docDefinition.content.push({
                margin: [0, 12, 0, 0],
                table: {
                    widths: ['*'],
                    body: [[{
                        stack: [
                            { text: 'SIGNED CONTRACT', font: 'Montserrat', fontSize: 11, bold: true, color: '#004a95', margin: [0, 0, 0, 8] },
                            {
                                columns: [
                                    {
                                        width: '*',
                                        stack: [
                                            { text: 'Customer Signature:', fontSize: 9, bold: true, color: '#2a2d2c', margin: [0, 0, 0, 4] },
                                            { image: signatureDataUrl, width: 180, height: 50, margin: [0, 0, 0, 4] },
                                            { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 180, y2: 0, lineWidth: 1, lineColor: '#2a2d2c' }], margin: [0, 0, 0, 2] },
                                            { text: signerName, fontSize: 9, color: '#2a2d2c', margin: [0, 0, 0, 2] },
                                            { text: signedDate, fontSize: 8, color: '#4d4d4d' }
                                        ]
                                    },
                                    {
                                        width: '*',
                                        stack: [
                                            { text: 'Acceptance:', fontSize: 9, bold: true, color: '#2a2d2c', margin: [0, 0, 0, 4] },
                                            { text: 'By signing above, customer acknowledges receipt of this quote and accepts the terms, conditions, and pricing described herein.', fontSize: 8, color: '#4d4d4d', lineHeight: 1.3 },
                                            { text: '50% deposit due at signing. Balance due upon completion of installation.', fontSize: 8, bold: true, color: '#2a2d2c', margin: [0, 6, 0, 0] }
                                        ]
                                    }
                                ],
                                columnGap: 20
                            }
                        ],
                        fillColor: '#f0fff4',
                        border: [true, true, true, true],
                        borderColor: ['#c3e6cb', '#c3e6cb', '#c3e6cb', '#c3e6cb'],
                        margin: [10, 8, 10, 8]
                    }]]
                },
                layout: {
                    hLineColor: function() { return '#c3e6cb'; },
                    vLineColor: function() { return '#c3e6cb'; },
                    paddingLeft: function() { return 10; },
                    paddingRight: function() { return 10; },
                    paddingTop: function() { return 8; },
                    paddingBottom: function() { return 8; }
                }
            });

            pdfMake.createPdf(docDefinition).getBlob(function(blob) {
                resolve(blob);
            });
        } catch (err) {
            reject(err);
        }
    });
}

async function uploadSignedPdf(pdfBlob) {
    const uploadUrl = `${WORKER_URL}/api/quote/${quoteId}/upload-signed-pdf`;
    const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: pdfBlob
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || 'Upload failed');
    }
    return result.url;
}

// ─── Submit Signature ────────────────────────────────────────────────────────
async function submitSignature() {
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    const signerName = document.getElementById('signerName').value.trim();
    const signatureData = signaturePad.toDataURL('image/png');

    // Generate and upload signed contract PDF (non-fatal)
    let signedPdfUrl = null;
    if (cachedQuoteData && quoteId) {
        try {
            btn.textContent = 'Generating signed contract...';
            const pdfBlob = await generateSignedPdf(cachedQuoteData, cachedQuoteNumber, signatureData, signerName);
            btn.textContent = 'Uploading signed contract...';
            signedPdfUrl = await uploadSignedPdf(pdfBlob);
        } catch (pdfError) {
            console.error('Signed PDF generation/upload failed (non-fatal):', pdfError);
            // Continue with signature submission — PDF is nice-to-have
        }
    }

    try {
        btn.textContent = 'Submitting signature...';

        let url;
        if (signingMode === 'remote' && signingToken) {
            url = `${WORKER_URL}/api/sign/${signingToken}`;
        } else {
            url = `${WORKER_URL}/api/quote/${quoteId}/sign-in-person`;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ signatureData, signerName, signedPdfUrl })
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
        ? `pay.html?quoteId=${quoteId}${signingMode === 'in-person' ? '&mode=in-person' : '&fromSignature=1'}`
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

    // Auto-redirect to payment for remote signing (not in-person — sales rep stays here)
    if (signingMode !== 'in-person' && paymentUrl) {
        let countdown = 3;
        const countdownEl = document.createElement('p');
        countdownEl.style.cssText = 'text-align: center; color: #666; margin-top: 12px; font-size: 0.95rem;';
        countdownEl.textContent = `Redirecting to payment page in ${countdown}...`;
        confirmScreen.appendChild(countdownEl);

        const timer = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownEl.textContent = `Redirecting to payment page in ${countdown}...`;
            } else {
                clearInterval(timer);
                window.location.href = paymentUrl;
            }
        }, 1000);
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
