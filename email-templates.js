/**
 * email-templates.js
 * Customer quote email generation and sending.
 * Edit this file when email format or wording changes.
 *
 * Dependencies:
 *   - WORKER_URL (declared in index.html inline script)
 *   - window.currentOrderData (set by displayOrderQuoteSummary in app.js)
 */

async function emailQuote() {
    const customerEmail = document.getElementById('customerEmail').value;
    const customerName = document.getElementById('customerName').value;

    if (!customerEmail) {
        alert('Please enter a customer email address');
        return;
    }

    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary.classList.contains('hidden')) {
        alert('Please calculate a quote first');
        return;
    }

    if (!window.currentOrderData) {
        alert('Please calculate an order quote first');
        return;
    }

    // Build HTML email
    const orderData = window.currentOrderData;
    let htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #0056A3 0%, #003D7A 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="margin: 0; font-size: 28px;">Roll-A-Shield</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">Custom Rolling Screen Quote</p>
            </div>

            <div style="background: white; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Dear ${customerName},</p>
                <p>Thank you for your interest in Roll-A-Shield custom rolling screens. We're pleased to provide you with the following quote:</p>

                <div style="background: #f9f9f9; border-left: 4px solid #0056A3; padding: 20px; margin: 20px 0;">
                    <h2 style="color: #0056A3; margin-top: 0;">Quote Summary</h2>
                    <p><strong>Total Screens:</strong> ${orderData.screens.length}</p>
    `;

    // Add each screen
    orderData.screens.forEach((screen, index) => {
        htmlBody += `
            <div style="border-top: 1px solid #ddd; padding-top: 15px; margin-top: 15px;">
                <h3 style="color: #333;">Screen ${index + 1}</h3>
                <p><strong>Track System:</strong> ${getClientFacingTrackName(screen.trackTypeName)}</p>
                <p><strong>Operator:</strong> ${getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName)}</p>
                <p><strong>Fabric Color:</strong> ${screen.fabricColorName}</p>
                <p><strong>Frame Color:</strong> ${screen.frameColorName || 'Not specified'}</p>
                <p><strong>Dimensions:</strong> ${screen.actualWidthDisplay} W x ${screen.actualHeightDisplay} H</p>
            </div>
        `;
    });

    htmlBody += `
                </div>

                <div style="background: #0056A3; color: white; padding: 20px; border-radius: 6px; margin: 20px 0;">
                    <h2 style="margin: 0 0 15px 0; font-size: 20px;">Pricing</h2>
                    <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                        <span>Materials Subtotal:</span>
                        <span style="font-weight: bold;">$${orderData.orderTotalMaterialsPrice.toFixed(2)}</span>
                    </div>
    `;

    if (orderData.discountPercent > 0) {
        htmlBody += `
            <div style="display: flex; justify-content: space-between; margin: 10px 0; color: #90EE90;">
                <span>${orderData.discountLabel || 'Discount'} (${orderData.discountPercent}%):</span>
                <span style="font-weight: bold;">-$${orderData.discountAmount.toFixed(2)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                <span>Discounted Materials Total:</span>
                <span style="font-weight: bold;">$${orderData.discountedMaterialsPrice.toFixed(2)}</span>
            </div>
        `;
    }

    htmlBody += `
                    <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                        <span>Installation:</span>
                        <span style="font-weight: bold;">$${orderData.orderTotalInstallationPrice.toFixed(2)}</span>
                    </div>
                    <div style="border-top: 2px solid white; margin-top: 15px; padding-top: 15px; display: flex; justify-content: space-between; font-size: 24px;">
                        <span>Grand Total:</span>
                        <span style="font-weight: bold;">$${orderData.orderTotalPrice.toFixed(2)}</span>
                    </div>
                </div>

                <p>This quote is valid for 30 days. Please contact us if you have any questions or would like to proceed with your order.</p>

                <p style="margin-top: 30px;">Best regards,<br>
                <strong>Roll-A-Shield Team</strong></p>
            </div>

            <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
                <p>Roll-A-Shield | Custom Rolling Screens</p>
            </div>
        </div>
    `;

    // Build plain text version
    let textBody = `Dear ${customerName},\n\nThank you for your interest in Roll-A-Shield custom rolling screens.\n\n`;
    textBody += `QUOTE SUMMARY\n`;
    textBody += `Total Screens: ${orderData.screens.length}\n\n`;

    orderData.screens.forEach((screen, index) => {
        textBody += `Screen ${index + 1}:\n`;
        textBody += `  Track: ${getClientFacingTrackName(screen.trackTypeName)}\n`;
        textBody += `  Operator: ${getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName)}\n`;
        textBody += `  Fabric: ${screen.fabricColorName}\n`;
        textBody += `  Frame: ${screen.frameColorName || 'Not specified'}\n`;
        textBody += `  Size: ${screen.actualWidthDisplay} W x ${screen.actualHeightDisplay} H\n\n`;
    });

    textBody += `PRICING\n`;
    textBody += `Materials Subtotal: $${orderData.orderTotalMaterialsPrice.toFixed(2)}\n`;
    if (orderData.discountPercent > 0) {
        textBody += `${orderData.discountLabel || 'Discount'} (${orderData.discountPercent}%): -$${orderData.discountAmount.toFixed(2)}\n`;
        textBody += `Discounted Materials: $${orderData.discountedMaterialsPrice.toFixed(2)}\n`;
    }
    textBody += `Installation: $${orderData.orderTotalInstallationPrice.toFixed(2)}\n`;
    textBody += `GRAND TOTAL: $${orderData.orderTotalPrice.toFixed(2)}\n\n`;
    textBody += `This quote is valid for 30 days.\n\nBest regards,\nRoll-A-Shield Team`;

    // Send via Cloudflare Worker
    const emailButton = document.querySelector('button[onclick="emailQuote()"]');
    if (emailButton) {
        emailButton.disabled = true;
        emailButton.textContent = 'Sending...';
    }

    try {
        const response = await fetch(`${WORKER_URL}/api/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: 'Roll-A-Shield Quotes <onboarding@resend.dev>',
                to: [customerEmail],
                cc: ['derek@rollashield.com'],
                subject: `Your Roll-A-Shield Screen Quote - ${customerName}`,
                html: htmlBody,
                text: textBody
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            alert(`✅ Quote sent successfully to ${customerEmail}!\n\nEmail ID: ${result.emailId}`);
        } else {
            console.error('Email API error:', result);
            alert('❌ Failed to send email: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error sending email:', error);
        alert('❌ Failed to send email. Please check your internet connection and try again.\n\nError: ' + error.message);
    } finally {
        if (emailButton) {
            emailButton.disabled = false;
            emailButton.textContent = 'Email Quote';
        }
    }
}
