/**
 * Roll-A-Shield PDF Template Generator
 * 
 * Usage with html2pdf.js:
 * 
 * import { generateQuotePDF } from './pdfTemplate.js';
 * import html2pdf from 'html2pdf.js';
 * 
 * const htmlString = generateQuotePDF(quoteData);
 * html2pdf().from(htmlString).save('quote.pdf');
 * 
 * Usage with jsPDF:
 * 
 * import { generateQuotePDF } from './pdfTemplate.js';
 * import jsPDF from 'jspdf';
 * 
 * const doc = new jsPDF();
 * doc.html(generateQuotePDF(quoteData), {
 *   callback: (doc) => doc.save('quote.pdf')
 * });
 */

/**
 * Generates HTML string for Roll-A-Shield quote PDF
 * 
 * @param {Object} data - Quote data object
 * @param {Object} data.customer - Customer information
 * @param {string} data.customer.name - Customer name
 * @param {string} [data.customer.company] - Customer company (optional)
 * @param {string} data.customer.address - Customer address
 * @param {string} data.customer.email - Customer email
 * @param {string} data.customer.phone - Customer phone
 * @param {Object} data.salesRep - Sales representative information
 * @param {string} data.salesRep.name - Sales rep name
 * @param {string} data.salesRep.email - Sales rep email
 * @param {string} data.salesRep.phone - Sales rep phone
 * @param {Object} data.quote - Quote details
 * @param {string} data.quote.number - Quote number
 * @param {string} data.quote.date - Quote date
 * @param {string} data.quote.validThrough - Quote valid through date
 * @param {Array} data.screens - Array of screen objects
 * @param {Object} data.pricing - Pricing breakdown
 * @param {Object} [data.comparisonPricing] - Optional comparison pricing
 * @param {string} [data.logoUrl] - Optional logo image URL (base64 or https://)
 * @returns {string} Complete HTML document string
 */
export function generateQuotePDF(data) {
  const hasComparison = !!data.comparisonPricing;
  const logoUrl = data.logoUrl || 'data:image/png;base64,YOUR_LOGO_BASE64_HERE';

  // Helper function to format currency
  const formatCurrency = (amount) => {
    return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Generate screen rows
  const screenRows = data.screens.map((screen, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? 'white' : '#f8fafc'};">
      <td style="padding: 8px; font-weight: 600; color: #2a2d2c;">${screen.name}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.track}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.operator}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.fabric}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.frame}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.width}</td>
      <td style="padding: 8px; color: #4d4d4d;">${screen.height}</td>
      <td style="padding: 8px; text-align: right; color: #2a2d2c;">$${formatCurrency(screen.price1)}</td>
      ${hasComparison ? `<td style="padding: 8px; text-align: right; color: #0071bc;">$${formatCurrency(screen.price2)}</td>` : ''}
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Roll-A-Shield Quote ${data.quote.number}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&family=Open+Sans:wght@400;600;700&display=swap" rel="stylesheet">
  
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Open Sans', sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    
    .page {
      width: 8.5in;
      min-height: 11in;
      background: white;
      margin: 0 auto;
    }
    
    @media print {
      .page {
        margin: 0;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <!-- Header Bar -->
    <div style="padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; color: white; background: linear-gradient(90deg, #004a95 0%, #0071bc 100%);">
      <div style="display: flex; align-items: center;">
        <img src="${logoUrl}" alt="Roll-A-Shield Logo" style="height: 45px;" />
      </div>
      <div style="text-align: right; font-size: 11px; line-height: 1.6;">
        <div>2680 S. Industrial Park Ave, Tempe, AZ 85282</div>
        <div>(480) 921-0200 • rollashield.com</div>
        <div>Established 1979 • AZ ROC #342265</div>
      </div>
    </div>

    <!-- Customer Info + Quote Info -->
    <div style="padding: 16px 32px; display: grid; grid-template-columns: 1fr 1fr; gap: 32px; background-color: #f9fafb;">
      <div>
        <div style="font-size: 11px; letter-spacing: 0.05em; margin-bottom: 4px; color: #4d4d4d;">PREPARED FOR</div>
        <div style="font-family: 'Montserrat', sans-serif; color: #004a95; font-size: 18px; font-weight: 700; margin-bottom: 4px;">
          ${data.customer.name}
        </div>
        ${data.customer.company ? `<div style="font-size: 14px; margin-bottom: 4px; color: #2a2d2c;">${data.customer.company}</div>` : ''}
        <div style="font-size: 14px; margin-bottom: 4px; color: #2a2d2c;">${data.customer.address}</div>
        <div style="font-size: 14px; color: #4d4d4d;">
          ${data.customer.email} | ${data.customer.phone}
        </div>
      </div>
      
      <div>
        <div style="font-size: 11px; letter-spacing: 0.05em; margin-bottom: 4px; color: #4d4d4d;">YOUR SALES REPRESENTATIVE</div>
        <div style="font-family: 'Montserrat', sans-serif; color: #004a95; font-size: 18px; font-weight: 700; margin-bottom: 4px;">
          ${data.salesRep.name}
        </div>
        <div style="font-size: 14px; color: #4d4d4d;">
          ${data.salesRep.email} • ${data.salesRep.phone}
        </div>
      </div>
    </div>

    <!-- Quote Number and Date -->
    <div style="padding: 12px 32px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb;">
      <div style="font-family: 'Montserrat', sans-serif;">
        <span style="font-size: 20px; font-weight: 800; color: #004a95;">PROJECT ESTIMATE</span>
        <span style="font-size: 18px; font-weight: 700; margin-left: 12px; color: #0071bc;">${data.quote.number}</span>
      </div>
      <div style="text-align: right; font-size: 14px; color: #4d4d4d;">
        <div><strong>Date:</strong> ${data.quote.date}</div>
        <div><strong>Valid through:</strong> ${data.quote.validThrough}</div>
      </div>
    </div>

    <!-- Screen Product Table -->
    <div style="padding: 16px 32px;">
      <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #004a95; color: white;">
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Screen Name</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Track</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Operator</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Fabric</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Frame</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Width</th>
            <th style="text-align: left; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600;">Height</th>
            <th style="text-align: right; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600; width: ${hasComparison ? '120px' : '140px'};">
              ${hasComparison ? data.comparisonPricing.option1Label : 'Price'}
            </th>
            ${hasComparison ? `
            <th style="text-align: right; padding: 8px; font-family: 'Montserrat', sans-serif; font-weight: 600; color: #19cbfa; width: 120px;">
              ${data.comparisonPricing.option2Label}
            </th>
            ` : ''}
          </tr>
        </thead>
        <tbody>
          ${screenRows}
        </tbody>
      </table>
    </div>

    <!-- Pricing Summary -->
    <div style="padding: 0 32px 16px;">
      <table style="width: 100%; font-size: 11px; border-collapse: collapse;">
        <tbody>
          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #4d4d4d;">
              Materials (${data.screens.length} screens):
            </td>
            <td style="padding: 8px 12px; text-align: right; color: #2a2d2c; width: ${hasComparison ? '120px' : '140px'};">
              $${formatCurrency(data.pricing.materials)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; color: #0071bc; width: 120px;">
              $${formatCurrency(data.comparisonPricing.materials2)}
            </td>
            ` : ''}
          </tr>

          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #4d4d4d;">
              Professional Installation:
            </td>
            <td style="padding: 8px 12px; text-align: right; color: #2a2d2c;">
              $${formatCurrency(data.pricing.installation)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; color: #0071bc;">
              $${formatCurrency(data.pricing.installation)}
            </td>
            ` : ''}
          </tr>

          ${data.pricing.discountPercent > 0 ? `
          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #16a34a;">
              Multi-Screen Discount (${data.pricing.discountPercent}%):
            </td>
            <td style="padding: 8px 12px; text-align: right; color: #16a34a;">
              −$${formatCurrency(data.pricing.discountAmount)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; color: #16a34a;">
              −$${formatCurrency(data.comparisonPricing.discountAmount2)}
            </td>
            ` : ''}
          </tr>
          ` : ''}

          <tr style="border-top: 1px solid #e5e7eb;">
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #2a2d2c;">
              Subtotal:
            </td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #2a2d2c;">
              $${formatCurrency(data.pricing.subtotal)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #0071bc;">
              $${formatCurrency(data.comparisonPricing.subtotal2)}
            </td>
            ` : ''}
          </tr>

          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #4d4d4d;">
              Sales Tax:
            </td>
            <td style="padding: 8px 12px; text-align: right; color: #2a2d2c;">
              $${formatCurrency(data.pricing.tax)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; color: #0071bc;">
              $${formatCurrency(data.pricing.tax)}
            </td>
            ` : ''}
          </tr>

          <tr>
            <td colspan="7"></td>
            <td style="padding: 12px; text-align: right; background-color: #004a95; color: white;">
              <span style="font-size: 18px; font-weight: 700; font-family: 'Montserrat', sans-serif;">TOTAL:</span>
            </td>
            <td style="padding: 12px; text-align: right; background-color: #004a95; color: white;">
              <span style="font-size: 18px; font-weight: 700; font-family: 'Montserrat', sans-serif;">
                $${formatCurrency(data.pricing.total)}
              </span>
            </td>
            ${hasComparison ? `
            <td style="padding: 12px; text-align: right; background-color: #004a95;">
              <span style="font-size: 18px; font-weight: 700; font-family: 'Montserrat', sans-serif; color: #19cbfa;">
                $${formatCurrency(data.comparisonPricing.total2)}
              </span>
            </td>
            ` : ''}
          </tr>

          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #4d4d4d;">
              Deposit (50%):
            </td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #2a2d2c;">
              $${formatCurrency(data.pricing.deposit)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #0071bc;">
              $${formatCurrency(data.comparisonPricing.deposit2)}
            </td>
            ` : ''}
          </tr>

          <tr>
            <td colspan="7"></td>
            <td style="padding: 8px 12px; text-align: right; color: #4d4d4d;">
              Balance Due at Completion:
            </td>
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #2a2d2c;">
              $${formatCurrency(data.pricing.balance)}
            </td>
            ${hasComparison ? `
            <td style="padding: 8px 12px; text-align: right; font-weight: 600; color: #0071bc;">
              $${formatCurrency(data.comparisonPricing.balance2)}
            </td>
            ` : ''}
          </tr>

          ${hasComparison ? `
          <tr>
            <td colspan="7"></td>
            <td></td>
            <td colspan="2" style="padding-top: 8px; padding-right: 12px; text-align: right; font-size: 11px; color: #4d4d4d;">
              <span style="margin-right: 16px;">◆ ${data.comparisonPricing.option1Label}</span>
              <span style="color: #0071bc;">◆ ${data.comparisonPricing.option2Label}</span>
            </td>
          </tr>
          ` : ''}
        </tbody>
      </table>
    </div>

    <!-- Limited Warranty -->
    <div style="padding: 12px 32px; border-top: 1px solid #e5e7eb;">
      <div style="font-size: 11px; font-weight: 700; margin-bottom: 4px; font-family: 'Montserrat', sans-serif; color: #004a95;">
        LIMITED WARRANTY — ROLLING SCREENS
      </div>
      <div style="font-size: 9pt; margin-bottom: 4px; color: #2a2d2c;">
        <strong>Coverage:</strong> Installation/Labor: 1 Year • Fabric: 10 Years (fading) • Motor: 5 Years • Electronics: 2 Years • Extrusions/Parts: 5 Year Manufacturer Warranty
      </div>
      <div style="font-size: 9pt; line-height: 1.3; color: #4d4d4d;">
        This warranty does not cover damage resulting from wind-related issues, closing on objects, unauthorized modification, misuse, neglect, accident, failure to provide necessary maintenance, normal wear and tear, or acts of God. Warranty is made to the original purchaser only and is not transferable. This warranty is exclusive and in lieu of any other warranties, express or implied, including implied warranties of merchantability or fitness for a particular purpose. Warranty is void if products are installed or repaired by anyone other than an authorized Roll-A-Shield agent.
      </div>
    </div>

    <!-- Payment & E-Signature Block -->
    <div style="margin: 12px 32px; padding: 12px; border: 2px dashed #d1d5db; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;">
      <div style="font-size: 11px; color: #2a2d2c;">
        <div style="font-weight: 700; margin-bottom: 4px; font-family: 'Montserrat', sans-serif; color: #004a95;">
          Payment Terms
        </div>
        <div style="margin-bottom: 4px;">50% deposit due at signing. Balance due upon completion of installation.</div>
        <div style="font-weight: 600; margin-bottom: 4px;">Accepted Methods:</div>
        <div>Check, ACH, Credit Card</div>
        <div style="font-size: 11px; color: #4d4d4d;">(3% processing fee applies to credit card payments)</div>
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="width: 120px; height: 120px; border: 2px dashed #0071bc; background-color: #f0f9ff; display: flex; align-items: center; justify-content: center; margin-bottom: 8px;">
          <div style="text-align: center; font-size: 11px; color: #0071bc;">
            <div style="font-weight: 700; margin-bottom: 4px;">QR CODE</div>
            <div style="font-size: 8pt;">Placeholder</div>
          </div>
        </div>
        <div style="font-size: 11px; text-align: center; font-weight: 600; color: #004a95;">
          E-Sign and Pay Now
        </div>
      </div>

      <div>
        <div style="font-weight: 700; margin-bottom: 4px; font-size: 11px; font-family: 'Montserrat', sans-serif; color: #004a95;">
          Customer Signature
        </div>
        <div style="border-bottom: 2px solid #2a2d2c; margin-bottom: 4px; padding-bottom: 24px;"></div>
        <div style="font-size: 11px; margin-bottom: 12px; color: #4d4d4d;">
          Signature
        </div>
        <div style="border-bottom: 2px solid #2a2d2c; margin-bottom: 4px; padding-bottom: 24px;"></div>
        <div style="font-size: 11px; color: #4d4d4d;">
          Date
        </div>
      </div>
    </div>

    <!-- Terms & Conditions -->
    <div style="padding: 8px 32px; font-size: 6.5pt; line-height: 1.3; color: #4d4d4d;">
      <div style="margin-bottom: 4px;">
        <strong>PURCHASE AGREEMENT:</strong> Signer of this agreement agrees to buy from Roll-A-Shield ("Seller") and Seller agrees to sell to, and if quoted herein, install for purchaser at the prices indicated. I understand that seventy-two (72) hours from the date of signing, the deposit shall not be refundable. I agree to pay the balance due upon completion of installation unless otherwise noted above. I accept the above proposal and authorize Roll-A-Shield to perform work as specified.
      </div>
      <div style="margin-bottom: 4px;">
        <strong>LEAD TIME:</strong> Estimated 4–6 weeks from order confirmation to installation. Exact scheduling will be coordinated once order is placed. • <strong>CHANGE ORDERS:</strong> Any modifications to the original scope must be agreed upon in writing. Additional charges may apply for changes requested after the order has been placed. • <strong>ACCESS & SITE CONDITIONS:</strong> Customer shall provide clear access to the work area. Any pre-existing conditions (structural, electrical, stucco, etc.) that impact installation are the customer's responsibility unless included in this scope. • <strong>CANCELLATION:</strong> Orders cancelled after placement are subject to a restocking fee of up to 25% of the materials cost. Custom-fabricated products are non-refundable.
      </div>
      <div>
        <strong>LIMITATION OF LIABILITY:</strong> Except where the law requires a different standard, in no event shall Roll-A-Shield be liable for any loss, damage or injury or for any direct, indirect, special, incidental, exemplary, or consequential damages (including without limitation, lost profits) arising out of or in connection with the services or products included in this agreement. Products are provided on an "as is" "where is" basis. To the fullest extent permitted by law, Roll-A-Shield disclaims all representations, warranties and conditions of any kind (express, implied, statutory or otherwise, including but not limited to the warranties of merchantability and fitness for a particular purpose) as to the services and products included in this agreement. • <strong>GOVERNING LAW:</strong> This agreement shall be governed by the laws of the State of Arizona. Any disputes shall be resolved in Maricopa County courts.
      </div>
    </div>

    <!-- Footer Bar -->
    <div style="padding: 12px 32px; text-align: center; font-size: 11px; color: white; margin-top: 16px; background-color: #004a95;">
      Roll-A-Shield • 2680 S. Industrial Park Ave, Tempe, AZ 85282 • (480) 921-0200 • rollashield.com • Protecting Arizona since 1979
    </div>
  </div>
</body>
</html>
  `.trim();
}

// Example data structure
export const exampleQuoteData = {
  customer: {
    name: "John Smith",
    company: "Smith Residence",
    address: "1234 Desert View Dr, Scottsdale, AZ 85260",
    email: "john.smith@email.com",
    phone: "(480) 555-1234"
  },
  salesRep: {
    name: "Maria Rodriguez",
    email: "maria@rollashield.com",
    phone: "(480) 921-0200"
  },
  quote: {
    number: "Q-2025-1234",
    date: "February 17, 2026",
    validThrough: "March 17, 2026"
  },
  screens: [
    {
      name: "Patio Screen #1",
      track: "Recessed",
      operator: "Remote Motor",
      fabric: "Standard Mesh",
      frame: "White",
      width: "144\"",
      height: "96\"",
      price1: 2450.00,
      price2: 2850.00 // Optional - only if using comparison pricing
    },
    {
      name: "Patio Screen #2",
      track: "Surface Mount",
      operator: "Manual Crank",
      fabric: "Solar Screen 90%",
      frame: "Bronze",
      width: "120\"",
      height: "84\"",
      price1: 1895.00,
      price2: 2195.00
    }
  ],
  pricing: {
    materials: 4345.00,
    installation: 800.00,
    discountPercent: 10,
    discountAmount: 434.50,
    subtotal: 4710.50,
    tax: 424.95,
    total: 5135.45,
    deposit: 2567.73,
    balance: 2567.72
  },
  // Optional comparison pricing (remove this if not needed)
  comparisonPricing: {
    option1Label: "Remote Motor",
    option2Label: "Solar Motor",
    materials2: 5045.00,
    discountAmount2: 504.50,
    subtotal2: 5340.50,
    total2: 5731.00,
    deposit2: 2865.50,
    balance2: 2865.50
  },
  // Optional: provide logo as base64 or URL
  logoUrl: "data:image/png;base64,YOUR_LOGO_BASE64_HERE"
};
