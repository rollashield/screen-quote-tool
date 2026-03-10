/**
 * quote-html-template.js
 * Renders a quote as styled HTML for inline display on sign.html.
 * Consumes the same templateData object as generateQuotePDF() in pdf-template.js.
 *
 * Dependencies:
 *   - pdf-template.js must be loaded first (provides LOGO_BASE64)
 */

function renderQuoteHtml(data) {
    var hasComparison = !!data.comparisonPricing;

    // Local currency formatter (matches pdf-template.js format)
    var fmt = function(amount) {
        return '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // HTML escaper
    var esc = function(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    };

    var colCount = hasComparison ? 9 : 8;

    // ── 1. Header Bar ──────────────────────────────────────────
    var logoSrc = (typeof LOGO_BASE64 !== 'undefined') ? 'data:image/png;base64,' + LOGO_BASE64 : '';

    var html = '<div class="qh-header">';
    if (logoSrc) {
        html += '<img src="' + logoSrc + '" alt="Roll-A-Shield" class="qh-logo">';
    }
    html += '<div class="qh-header-info">';
    html += '<div>2680 S. Industrial Park Ave, Tempe, AZ 85282</div>';
    html += '<div>(480) 921-0200 &bull; rollashield.com</div>';
    html += '<div>Established 1979 &bull; AZ ROC #342265</div>';
    html += '</div></div>';

    // ── 2. Customer Info Panel ─────────────────────────────────
    html += '<div class="qh-customer-panel">';

    // Left: Prepared For
    html += '<div class="qh-customer-col">';
    html += '<div class="qh-section-label">PREPARED FOR</div>';
    if (data.customer.name) html += '<div class="qh-customer-name">' + esc(data.customer.name) + '</div>';
    if (data.customer.company) html += '<div class="qh-detail">' + esc(data.customer.company) + '</div>';
    if (data.customer.address) html += '<div class="qh-detail">' + esc(data.customer.address) + '</div>';
    var contactParts = [data.customer.email, data.customer.phone].filter(Boolean);
    if (contactParts.length) html += '<div class="qh-detail qh-muted">' + esc(contactParts.join(' | ')) + '</div>';
    html += '</div>';

    // Right: Sales Rep
    html += '<div class="qh-customer-col">';
    html += '<div class="qh-section-label">YOUR SALES REPRESENTATIVE</div>';
    if (data.salesRep.name) html += '<div class="qh-customer-name">' + esc(data.salesRep.name) + '</div>';
    var repParts = [data.salesRep.email, data.salesRep.phone].filter(Boolean);
    if (repParts.length) html += '<div class="qh-detail qh-muted">' + esc(repParts.join(' \u2022 ')) + '</div>';
    html += '</div>';

    html += '</div>';

    // ── 3. Quote Number Bar ────────────────────────────────────
    html += '<div class="qh-quote-bar">';
    html += '<div class="qh-quote-title">';
    html += '<span class="qh-estimate-label">PROJECT ESTIMATE</span> ';
    html += '<span class="qh-quote-number">' + esc(data.quote.number) + '</span>';
    html += '</div>';
    html += '<div class="qh-quote-dates">';
    html += '<div><strong>Date:</strong> ' + esc(data.quote.date) + '</div>';
    html += '<div><strong>Valid through:</strong> ' + esc(data.quote.validThrough) + '</div>';
    if (data.pricing.fourWeekGuarantee) {
        html += '<div class="qh-guarantee-badge">4-Week Install Guarantee</div>';
    }
    html += '</div></div>';

    // ── 4. Screen Product Table ────────────────────────────────
    html += '<div class="qh-table-wrap">';
    html += '<table class="qh-screen-table">';

    // Header
    html += '<thead><tr>';
    html += '<th>Screen Name</th>';
    html += '<th>Track</th>';
    html += '<th>Operator</th>';
    html += '<th class="qh-col-fabric">Fabric</th>';
    html += '<th class="qh-col-frame">Frame</th>';
    html += '<th>Width</th>';
    html += '<th>Height</th>';
    html += '<th class="qh-price-col">' + (hasComparison ? esc(data.comparisonPricing.option1Label) : 'Price') + '</th>';
    if (hasComparison) {
        html += '<th class="qh-price-col qh-comp-col">' + esc(data.comparisonPricing.option2Label) + '</th>';
    }
    html += '</tr></thead>';

    // Body
    html += '<tbody>';

    // Screen rows
    data.screens.forEach(function(screen) {
        html += '<tr>';
        html += '<td class="qh-screen-name">' + esc(screen.name) + '</td>';
        html += '<td>' + esc(screen.track) + '</td>';
        html += '<td>' + esc(screen.operator) + '</td>';
        html += '<td class="qh-col-fabric">' + esc(screen.fabric) + '</td>';
        html += '<td class="qh-col-frame">' + esc(screen.frame) + '</td>';
        html += '<td>' + esc(screen.width) + '</td>';
        html += '<td>' + esc(screen.height) + '</td>';
        html += '<td class="qh-price-cell">' + fmt(screen.price1) + '</td>';
        if (hasComparison) {
            html += '<td class="qh-price-cell qh-comp-price">' + (screen.price2 != null ? fmt(screen.price2) : 'N/A') + '</td>';
        }
        html += '</tr>';
    });

    // Project accessories rows
    (data.projectAccessories || []).forEach(function(acc) {
        html += '<tr class="qh-accessory-row">';
        html += '<td colspan="' + (colCount - 1) + '">' + esc(acc.name) + (acc.quantity > 1 ? ' (x' + acc.quantity + ')' : '') + '</td>';
        html += '<td class="qh-price-cell">' + fmt(acc.lineTotal) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';

    // ── 5. Pricing Summary ─────────────────────────────────────
    html += '<div class="qh-pricing-summary"><table class="qh-pricing-table">';

    // Helper to add pricing rows
    function addPricingRow(label, val1, val2, cssClass, isBold) {
        var cls = cssClass ? ' class="' + cssClass + '"' : '';
        var bOpen = isBold ? '<strong>' : '';
        var bClose = isBold ? '</strong>' : '';
        html += '<tr' + cls + '>';
        html += '<td class="qh-label">' + bOpen + esc(label) + bClose + '</td>';
        html += '<td class="qh-value">' + bOpen + val1 + bClose + '</td>';
        if (hasComparison) {
            html += '<td class="qh-comp-value">' + bOpen + (val2 || '') + bClose + '</td>';
        }
        html += '</tr>';
    }

    // Materials
    addPricingRow(
        'Materials (' + data.screens.length + ' screen' + (data.screens.length !== 1 ? 's' : '') + '):',
        fmt(data.pricing.materials),
        hasComparison ? fmt(data.comparisonPricing.materials2) : ''
    );

    // Installation (itemized breakdown for multi-screen quotes)
    var installLabel = 'Professional Installation:';
    if (data.pricing.installation > 0 && data.screens.length > 1) {
        var perScreenPrices = data.screens
            .filter(function(s) { return s.installPrice > 0; })
            .map(function(s) { return '$' + formatCurrency(s.installPrice); });
        if (perScreenPrices.length > 1) {
            installLabel = 'Professional Installation (' + perScreenPrices.join(', ') + '):';
        }
    }
    addPricingRow(
        installLabel,
        fmt(data.pricing.installation),
        hasComparison ? fmt(data.pricing.installation) : ''
    );

    // Wiring (conditional)
    if (data.pricing.wiring > 0) {
        addPricingRow(
            'Electrical Wiring:',
            fmt(data.pricing.wiring),
            hasComparison ? fmt(data.pricing.wiring) : ''
        );
    }

    // Misc install (conditional)
    if (data.pricing.miscInstallAmount > 0) {
        addPricingRow(
            (data.pricing.miscInstallLabel || 'Additional Installation') + ':',
            fmt(data.pricing.miscInstallAmount),
            hasComparison ? fmt(data.pricing.miscInstallAmount) : ''
        );
    }

    // Discount (conditional, green)
    if (data.pricing.discountPercent > 0) {
        html += '<tr class="qh-discount-row">';
        html += '<td class="qh-label qh-discount">Multi-Screen Discount (' + data.pricing.discountPercent + '%):</td>';
        html += '<td class="qh-value qh-discount">\u2212' + fmt(data.pricing.discountAmount) + '</td>';
        if (hasComparison) {
            html += '<td class="qh-comp-value qh-discount">\u2212' + fmt(data.comparisonPricing.discountAmount2) + '</td>';
        }
        html += '</tr>';
    }

    // Guarantee savings (conditional, green)
    if (data.pricing.guaranteeDiscount > 0) {
        html += '<tr class="qh-guarantee-row">';
        html += '<td class="qh-label qh-guarantee">4-Week Guarantee Savings (included):</td>';
        html += '<td class="qh-value qh-guarantee">\u2212' + fmt(data.pricing.guaranteeDiscount) + '</td>';
        if (hasComparison) {
            html += '<td class="qh-comp-value qh-guarantee">\u2212' + fmt(data.pricing.guaranteeDiscount) + '</td>';
        }
        html += '</tr>';
    }

    // Subtotal
    addPricingRow(
        'Subtotal:',
        fmt(data.pricing.subtotal),
        hasComparison ? fmt(data.comparisonPricing.subtotal2) : '',
        'qh-subtotal-row', true
    );

    // Tax
    addPricingRow(
        'Sales Tax:',
        data.pricing.tax === 0 ? 'Included' : fmt(data.pricing.tax),
        hasComparison ? (data.pricing.tax === 0 ? 'Included' : fmt(data.pricing.tax)) : ''
    );

    // TOTAL (special blue row)
    html += '<tr class="qh-total-row">';
    html += '<td>TOTAL:</td>';
    html += '<td>' + fmt(data.pricing.total) + '</td>';
    if (hasComparison) {
        html += '<td class="qh-comp-value">' + fmt(data.comparisonPricing.total2) + '</td>';
    }
    html += '</tr>';

    // Deposit
    addPricingRow(
        'Deposit (50%):',
        fmt(data.pricing.deposit),
        hasComparison ? fmt(data.comparisonPricing.deposit2) : '',
        null, true
    );

    // Balance
    addPricingRow(
        'Balance Due at Completion:',
        fmt(data.pricing.balance),
        hasComparison ? fmt(data.comparisonPricing.balance2) : '',
        null, true
    );

    // Comparison legend
    if (hasComparison) {
        html += '<tr><td></td><td colspan="2" class="qh-comp-legend">';
        html += '<span class="qh-legend-primary">\u25C6 ' + esc(data.comparisonPricing.option1Label) + '</span>';
        html += '&nbsp;&nbsp;&nbsp;';
        html += '<span class="qh-legend-comp">\u25C6 ' + esc(data.comparisonPricing.option2Label) + '</span>';
        html += '</td></tr>';
    }

    html += '</table></div>';

    // ── 6. Warranty Section ────────────────────────────────────
    html += '<div class="qh-warranty">';
    html += '<h4>LIMITED WARRANTY \u2014 ROLLING SCREENS</h4>';
    html += '<div class="qh-coverage"><strong>Coverage:</strong> Installation/Labor: 1 Year \u2022 Fabric: 10 Years (fading) \u2022 Motor: 5 Years \u2022 Electronics: 2 Years \u2022 Extrusions/Parts: 5 Year Manufacturer Warranty</div>';
    html += '<div class="qh-exclusions">This warranty does not cover damage resulting from wind-related issues, closing on objects, unauthorized modification, misuse, neglect, accident, failure to provide necessary maintenance, normal wear and tear, or acts of God. Warranty is made to the original purchaser only and is not transferable. This warranty is exclusive and in lieu of any other warranties, express or implied, including implied warranties of merchantability or fitness for a particular purpose. Warranty is void if products are installed or repaired by anyone other than an authorized Roll-A-Shield agent.</div>';
    html += '</div>';

    // ── 7. Payment/Signature Block — OMITTED (customer is on signing page) ──

    // ── 8. Terms & Conditions ──────────────────────────────────
    html += '<div class="qh-terms">';
    html += '<p><strong>PURCHASE AGREEMENT:</strong> Signer of this agreement agrees to buy from Roll-A-Shield (\u201CSeller\u201D) and Seller agrees to sell to, and if quoted herein, install for purchaser at the prices indicated. I understand that seventy-two (72) hours from the date of signing, the deposit shall not be refundable. I agree to pay the balance due upon completion of installation unless otherwise noted above. I accept the above proposal and authorize Roll-A-Shield to perform work as specified.</p>';
    html += '<p><strong>LEAD TIME:</strong> Estimated 4-6 weeks from order confirmation to installation. Exact scheduling will be coordinated once order is placed. \u2022 <strong>CHANGE ORDERS:</strong> Any modifications to the original scope must be agreed upon in writing. Additional charges may apply for changes requested after the order has been placed. \u2022 <strong>ACCESS &amp; SITE CONDITIONS:</strong> Customer shall provide clear access to the work area. Any pre-existing conditions (structural, electrical, stucco, etc.) that impact installation are the customer\u2019s responsibility unless included in this scope. \u2022 <strong>CANCELLATION:</strong> Orders cancelled after placement are subject to a restocking fee of up to 25% of the materials cost. Custom-fabricated products are non-refundable.</p>';
    html += '<p><strong>LIMITATION OF LIABILITY:</strong> Except where the law requires a different standard, in no event shall Roll-A-Shield be liable for any loss, damage or injury or for any direct, indirect, special, incidental, exemplary, or consequential damages (including without limitation, lost profits) arising out of or in connection with the services or products included in this agreement. Products are provided on an \u201Cas is\u201D \u201Cwhere is\u201D basis. To the fullest extent permitted by law, Roll-A-Shield disclaims all representations, warranties and conditions of any kind (express, implied, statutory or otherwise, including but not limited to the warranties of merchantability and fitness for a particular purpose) as to the services and products included in this agreement. \u2022 <strong>GOVERNING LAW:</strong> This agreement shall be governed by the laws of the State of Arizona. Any disputes shall be resolved in Maricopa County courts.</p>';
    html += '</div>';

    // ── 9. Footer Bar ──────────────────────────────────────────
    html += '<div class="qh-footer">';
    html += 'Roll-A-Shield \u2022 2680 S. Industrial Park Ave, Tempe, AZ 85282 \u2022 (480) 921-0200 \u2022 rollashield.com \u2022 Protecting Arizona since 1979';
    html += '</div>';

    return '<div class="quote-html-preview">' + html + '</div>';
}

// Module export for testability
if (typeof module !== 'undefined') {
    module.exports = { renderQuoteHtml: renderQuoteHtml };
}
