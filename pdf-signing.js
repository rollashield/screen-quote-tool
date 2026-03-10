/**
 * pdf-signing.js
 * PDF generation, data mapping, signature and finalization workflows.
 *
 * Dependencies:
 *   - pricing-engine.js (provides getClientFacingOperatorName, getClientFacingTrackName,
 *     formatCurrency, getTrackTypeName, getOperatorTypeName, getFabricName, getFrameColorName)
 *   - quote-persistence.js (provides ensureQuoteSaved, saveQuote, refreshEmailHistory)
 *   - pdf-template.js (provides generateQuotePdfHtml)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - currentQuoteId: Active quote's DB ID
 *   - isSaving: Save lock flag
 *   - screensInOrder: Array of screen objects
 *   - WORKER_URL: Worker base URL (from index.html)
 *   - window.currentOrderData: Calculated order data
 *
 * Extracted from app.js in Step 2 refactoring.
 */

// ─── Data Mapping: currentOrderData → PDF template format ────────────────────
function mapOrderDataToTemplate(orderData) {
    // Guard: block PDF generation for incomplete quotes (exclude excluded screens from check)
    const unconfigured = (orderData.screens || []).filter(s => s.phase === 'opening' && !s.excluded);
    if (unconfigured.length > 0) {
        throw new Error(`Cannot generate PDF — ${unconfigured.length} opening(s) still need configuration.`);
    }

    const address = [
        orderData.streetAddress,
        orderData.aptSuite,
        [orderData.city, orderData.state, orderData.zipCode].filter(Boolean).join(', ')
    ].filter(Boolean).join(', ');

    const screens = (orderData.screens || []).filter(s => !s.excluded).map((screen, i) => ({
        name: screen.screenName || `Screen ${i + 1}`,
        track: getClientFacingTrackName(screen.trackTypeName),
        operator: getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName),
        fabric: screen.fabricColorName || '',
        frame: screen.frameColorName || '',
        width: screen.actualWidthDisplay || '',
        height: screen.actualHeightDisplay || '',
        price1: (screen.customerPrice || 0) - (screen.installationPrice || 0) - (screen.wiringPrice || 0),
        price2: screen.comparisonMaterialPrice != null ? screen.comparisonMaterialPrice : null,
        installPrice: screen.installationPrice || 0
    }));

    const materialsPrice = orderData.orderTotalMaterialsPrice || 0;
    const installationPrice = orderData.orderTotalInstallationPrice || 0;
    const wiringPrice = orderData.orderTotalWiringPrice || 0;
    const miscInstallAmount = orderData.miscInstallAmount || 0;
    const discountPercent = orderData.discountPercent || 0;
    const discountAmount = orderData.discountAmount || 0;
    const subtotal = (discountPercent > 0 ? orderData.discountedMaterialsPrice : materialsPrice) + installationPrice + wiringPrice + miscInstallAmount;
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
            validThrough: new Date(Date.now() + ((orderData.fourWeekGuarantee ? 1 : 30) * 24 * 60 * 60 * 1000)).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
        },
        signingUrl: orderData.id
            ? `https://rollashield.github.io/screen-quote-tool/sign.html?quoteId=${orderData.id}&mode=in-person`
            : null,
        screens: screens,
        projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0).map(acc => ({
            name: acc.name,
            quantity: acc.quantity,
            unitPrice: acc.customerPrice,
            lineTotal: acc.customerPrice * acc.quantity
        })),
        pricing: {
            materials: materialsPrice,
            installation: installationPrice,
            wiring: wiringPrice,
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: miscInstallAmount,
            discountPercent: discountPercent,
            discountAmount: discountAmount,
            subtotal: subtotal,
            tax: 0,
            total: total,
            deposit: total / 2,
            balance: total / 2,
            guaranteeDiscount: orderData.totalGuaranteeDiscount || 0,
            fourWeekGuarantee: orderData.fourWeekGuarantee || false
        },
        comparisonPricing: null
    };

    // Build comparison pricing if enabled
    if (orderData.enableComparison) {
        const compMaterials = orderData.comparisonTotalMaterialsPrice || 0;
        const compDiscounted = orderData.comparisonDiscountedMaterialsPrice || compMaterials;
        const compSubtotal = (discountPercent > 0 ? compDiscounted : compMaterials) + installationPrice + wiringPrice + miscInstallAmount;
        const compTotal = orderData.comparisonTotalPrice || 0;

        // Get comparison labels based on type (motor or track)
        const firstScreen = (orderData.screens || []).find(s => !s.excluded);
        let option1Label, option2Label;
        if (orderData.comparisonType === 'track') {
            option1Label = firstScreen
                ? getClientFacingTrackName(firstScreen.trackTypeName)
                : 'Option 1';
            option2Label = orderData.comparisonTrack
                ? getTrackTypeName(orderData.comparisonTrack).replace(' Track', '')
                : 'Option 2';
        } else {
            option1Label = firstScreen
                ? getClientFacingOperatorName(firstScreen.operatorType, firstScreen.operatorTypeName)
                : 'Option 1';
            option2Label = orderData.comparisonMotor
                ? getClientFacingOperatorName(orderData.comparisonMotor, orderData.comparisonMotor)
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

async function generatePDF() {
    // Recalculate to ensure totals are current before generating PDF
    if (!calculateOrderQuote()) return;

    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary.classList.contains('hidden')) {
        alert('Please calculate a quote first');
        return;
    }

    // Fallback if pdfmake not loaded
    if (typeof pdfMake === 'undefined' || typeof generateQuotePDF === 'undefined') {
        console.warn('pdfMake or pdf-template not loaded, falling back to window.print()');
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
        const pdfBlob = await generatePdfBlob();
        const quoteNum = window.currentOrderData.quoteNumber || 'DRAFT';
        const customerName = (window.currentOrderData.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
        const filename = `RAS-Quote-${quoteNum}-${customerName}.pdf`;

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

/**
 * Generate PDF blob from current order data.
 * Reusable helper — used by generatePDF() for download and sendQuoteForSignature() for email attachment.
 */
async function generatePdfBlob() {
    const templateData = mapOrderDataToTemplate(window.currentOrderData);
    const docDefinition = generateQuotePDF(templateData);

    return new Promise((resolve, reject) => {
        try {
            pdfMake.createPdf(docDefinition).getBlob(blob => {
                resolve(blob);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Combined action: send quote PDF + signing link in one email.
 * Replaces separate "Email Quote" and "Send for Signature" buttons.
 */
async function sendQuoteForSignature() {
    // Recalculate to ensure totals are current before sending
    if (!calculateOrderQuote()) return;

    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first before sending.');
        return;
    }

    const customerEmail = window.currentOrderData.customerEmail || document.getElementById('customerEmail')?.value;
    if (!customerEmail) {
        alert('Please enter a customer email address before sending.');
        return;
    }

    if (!confirm(`Send quote PDF and signing link to ${customerEmail}?`)) {
        return;
    }

    const btn = document.querySelector('button[onclick="sendQuoteForSignature()"]');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Saving & Generating PDF...';
    }

    try {
        // 1. Save quote first
        const saved = await ensureQuoteSaved();
        if (!saved) {
            if (btn) { btn.disabled = false; btn.textContent = 'Send Quote & Request Signature'; }
            return;
        }

        // 2. Generate PDF blob and convert to base64
        if (btn) btn.textContent = 'Generating PDF...';

        if (typeof pdfMake === 'undefined' || typeof generateQuotePDF === 'undefined') {
            alert('PDF generation not available. Please reload the page and try again.');
            if (btn) { btn.disabled = false; btn.textContent = 'Send Quote & Request Signature'; }
            return;
        }

        const pdfBlob = await generatePdfBlob();
        const pdfBase64 = await blobToBase64(pdfBlob);

        const quoteNum = window.currentOrderData.quoteNumber || 'DRAFT';
        const customerName = (window.currentOrderData.customerName || 'Customer').replace(/[^a-zA-Z0-9]/g, '-');
        const pdfFilename = `RAS-Quote-${quoteNum}-${customerName}.pdf`;

        // 3. Send to worker with PDF attachment
        if (btn) btn.textContent = 'Sending...';

        const response = await fetch(`${WORKER_URL}/api/quote/${window.currentOrderData.id}/send-for-signature`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pdfBase64, pdfFilename })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            alert(`Quote PDF and signing link sent to ${customerEmail}!`);
            // Show checkmark on button to reflect it's been sent
            if (btn) {
                btn.innerHTML = '✓ Quote Sent & Signature Requested';
                btn.style.background = '#28a745';
                btn.disabled = true;
            }
            // Refresh email history if visible (function created in Phase 7.6)
            if (currentQuoteId && typeof refreshEmailHistory === 'function') refreshEmailHistory();
            return; // Skip finally block's reset
        } else {
            alert('Failed to send: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending quote for signature:', error);
        alert('Failed to send. Please check your internet connection.');
    }
    // Only restore button if send failed (success returns early above)
    if (btn) {
        btn.disabled = false;
        btn.textContent = 'Send Quote & Request Signature';
    }
}

// ─── Signature Functions ─────────────────────────────────────────────────────

// autoSaveQuote, ensureQuoteSaved moved to quote-persistence.js

async function presentForSignature() {
    // Recalculate to ensure totals are current before presenting
    if (!calculateOrderQuote()) return;

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

async function finalizeProjectDetails() {
    if (isSaving) return;

    // Recalculate to ensure totals are current before finalizing
    if (!calculateOrderQuote()) return;

    // Check if order has been calculated
    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate an order quote first before finalizing project details.');
        return;
    }

    isSaving = true;
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (finalizeBtn) finalizeBtn.disabled = true;

    const orderData = window.currentOrderData;
    const orderId = orderData.id || Date.now();

    // Upload pending photos and clean up deletions before saving
    try {
        for (let i = 0; i < orderData.screens.length; i++) {
            const screen = orderData.screens[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(orderId.toString(), i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }
        await deleteMarkedPhotos();
    } catch (photoErr) {
        console.error('Photo processing error:', photoErr);
    }

    // Strip Blob objects before serialization
    const screensForFinalize = orderData.screens.map(s => {
        const { pendingPhotos, ...rest } = s;
        return rest;
    });

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
                screens: screensForFinalize,
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
                miscInstallLabel: orderData.miscInstallLabel || '',
                miscInstallAmount: orderData.miscInstallAmount || 0,
                miscInstallCost: orderData.miscInstallCost || 0,
                projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
                projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
                projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
                // Airtable integration fields
                airtableOpportunityId: orderData.airtableOpportunityId || '',
                airtableContactId: orderData.airtableContactId || '',
                airtableOpportunityName: orderData.airtableOpportunityName || '',
                internalComments: document.getElementById('internalComments')?.value || '',
                fourWeekGuarantee: orderData.fourWeekGuarantee || false,
                totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0
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
        if (finalizeBtn) finalizeBtn.disabled = false;
    }
}


// ─── Node.js exports (for testing) ───────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        mapOrderDataToTemplate, generatePDF, generatePdfBlob, blobToBase64,
        sendQuoteForSignature, presentForSignature, finalizeProjectDetails
    };
}
