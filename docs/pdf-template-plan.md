# Figma PDF Template Integration

> **Status**: ✅ Completed — implemented in `pdf-template.js`, integrated into `index.html` and `sign.html`
> **Created**: 2026-02-17
> **Figma export in repo**: `figma-export/` directory — contains `pdfTemplate.js`, `example-usage.js`, `README.md`, `logo-horizontal-dark.png`
> **Key file**: `figma-export/pdfTemplate.js` — ES Module function that returns HTML string
> **Prerequisite for**: Signature feature (sign.html reuses this template for quote display)

## Context
The screen quote tool's "Download PDF" button currently calls `window.print()`, which relies on browser print styling and produces inconsistent results. Figma exported a professionally designed PDF template as a JavaScript function (`generateQuotePDF`) that returns a full HTML document string. We need to integrate this template into the existing vanilla JS project, convert it from ES Module format, map the existing `window.currentOrderData` fields to the template's expected data shape, and use `html2pdf.js` (CDN) to generate actual PDF files client-side.

The template includes: header with logo + company info, customer/sales rep info, screen product table (with optional comparison pricing columns), pricing summary with deposit/balance, warranty section, payment terms + QR code placeholder + signature block, terms & conditions, and footer.

---

## Files to Change

### New: `pdf-template.js`
Convert the Figma-exported `src/exports/pdfTemplate.js` from ES Module to a plain global script:
- Remove `export` keyword from `generateQuotePDF` — declare as global function
- Remove `export const exampleQuoteData` (not needed)
- Add `const LOGO_BASE64 = 'data:image/png;base64,...'` at top with the embedded `logo-dark.png`
- Use `LOGO_BASE64` as the default logo instead of the placeholder string
- Hide the tax row when `data.pricing.tax === 0` (tax not currently calculated)

Source: `figma-export/pdfTemplate.js` (in this repo)

### Modify: `index.html`
Add to `<head>` (font preloading for PDF rendering):
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Open+Sans:wght@400;600&display=swap" rel="stylesheet">
```

Add before `</body>`, after the existing script tags:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script src="pdf-template.js"></script>
```

### Modify: `app.js`
Three changes:

**1. Add `mapOrderDataToTemplate(orderData)` function** (near line 1252)

Maps `window.currentOrderData` (flat structure) → template's nested structure:

| Template field | Source from `currentOrderData` |
|---|---|
| `customer.name` | `customerName` |
| `customer.company` | `companyName` (or empty) |
| `customer.address` | `streetAddress` + `aptSuite` + `city, state zipCode` combined |
| `customer.email/phone` | `customerEmail`, `customerPhone` |
| `salesRep.name/email/phone` | `salesRepName`, `salesRepEmail`, `salesRepPhone` |
| `quote.number` | `quoteNumber` (or `'DRAFT'` if unsaved) |
| `quote.date` | Current date formatted |
| `quote.validThrough` | `'30 Days'` |
| `screens[].name` | `screenName` or `'Screen ' + (index+1)` |
| `screens[].track` | `getClientFacingTrackName(trackTypeName)` (reuse existing function at line 446) |
| `screens[].operator` | `getClientFacingOperatorName(operatorType, operatorTypeName)` (reuse existing function at line 429) |
| `screens[].fabric/frame` | `fabricColorName`, `frameColorName` |
| `screens[].width/height` | `actualWidthDisplay`, `actualHeightDisplay` |
| `screens[].price1` | `customerPrice - installationPrice` (materials only per screen) |
| `screens[].price2` | `comparisonMaterialPrice` (if comparison enabled, else null) |
| `pricing.materials` | `orderTotalMaterialsPrice` |
| `pricing.installation` | `orderTotalInstallationPrice` |
| `pricing.discountPercent/Amount` | `discountPercent`, `discountAmount` |
| `pricing.subtotal` | `discountedMaterialsPrice` or `orderTotalMaterialsPrice` (if no discount) |
| `pricing.tax` | `0` (not calculated yet — template hides row when zero) |
| `pricing.total` | `orderTotalPrice` |
| `pricing.deposit` | `orderTotalPrice / 2` (50% deposit) |
| `pricing.balance` | `orderTotalPrice - deposit` |
| `comparisonPricing` | Built from `comparisonTotalMaterialsPrice`, `comparisonDiscountedMaterialsPrice`, `comparisonTotalPrice` — `null` if `!enableComparison` |
| `comparisonPricing.option1Label` | `getClientFacingOperatorName()` of first motorized screen's operator |
| `comparisonPricing.option2Label` | `getClientFacingOperatorName(comparisonMotor)` |

**2. Replace `generatePDF()` function** (lines 1252-1272)

New implementation:
- Check `html2pdf` is loaded — if not, fall back to old `window.print()` behavior with console warning
- Call `mapOrderDataToTemplate(window.currentOrderData)` to get normalized data
- Call `generateQuotePDF(data)` to get HTML string
- Render in an offscreen container (`position: absolute; left: -9999px`)
- Wait for `document.fonts.ready` (ensures Montserrat/Open Sans are loaded before canvas render)
- Call `html2pdf()` with options: margin 0, letter format, scale 2, JPEG quality 0.98
- Filename: `RAS-Quote-{quoteNumber}-{CustomerName}.pdf`
- Clean up offscreen container after generation

**3. Fix `saveQuote()` success handler** (line ~1064)

Add after `if (response.ok && result.success)`:
```javascript
window.currentOrderData.quoteNumber = result.quoteNumber;
```
Without this, PDFs generated after saving (without page reload) show "DRAFT" instead of the assigned quote number.

### Prepare: `logo-dark.png` → base64

Convert the existing `logo-dark.png` (82KB, 3003×535 RGBA PNG) to a base64 data URI and embed as a constant in `pdf-template.js`. This avoids CORS issues with `html2canvas` (which can't fetch external images across origins). The base64 string will be ~110KB.

---

## Template Data Structure (Expected by `generateQuotePDF()`)

```javascript
{
  customer: { name, company, address, email, phone },
  salesRep: { name, email, phone },
  quote: { number, date, validThrough },
  screens: [{ name, track, operator, fabric, frame, width, height, price1, price2 }],
  pricing: { materials, installation, discountPercent, discountAmount, subtotal, tax, total, deposit, balance },
  comparisonPricing: { option1Label, option2Label, materials2, discountAmount2, subtotal2, total2, deposit2, balance2 } | null,
  logoUrl: "data:image/png;base64,..."
}
```

See the full exported template with example data in: `figma-export/pdfTemplate.js`

---

## Implementation Steps

1. **Convert logo to base64** — one-time operation using browser devtools or certutil
2. **Create `pdf-template.js`** — convert Figma export to plain script, embed logo, hide tax row when zero
3. **Update `index.html`** — add Google Fonts preload + CDN script tags
4. **Add `mapOrderDataToTemplate()` to `app.js`** — data mapping function
5. **Replace `generatePDF()` in `app.js`** — new html2pdf-based implementation with fallback
6. **Fix `saveQuote()` in `app.js`** — write quoteNumber back to currentOrderData

---

## Verification

- **Single screen, no discount, no comparison**: Clean single-column PDF with correct pricing
- **3+ screens with discount**: Discount row appears in green, totals are correct
- **Comparison pricing enabled**: Two price columns render with correct labels and totals
- **Unsaved quote**: PDF shows "DRAFT" for quote number
- **Saved quote**: PDF shows actual quote number (e.g., Q2602-001)
- **Save then PDF (no reload)**: Quote number appears (not "DRAFT") thanks to saveQuote fix
- **Font rendering**: Montserrat headlines, Open Sans body (not browser defaults)
- **CDN offline**: Falls back to window.print() with console warning
- **Logo**: Renders in header bar (not broken image icon)
- **Deposit/balance**: 50/50 split displayed correctly
- **Long content (5+ screens)**: PDF handles page overflow without cutting off content
