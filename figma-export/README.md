# Roll-A-Shield PDF Template Generator

A vanilla JavaScript template function for generating professional, print-ready PDF quotes for Roll-A-Shield.

## Quick Start

```javascript
import { generateQuotePDF } from './pdfTemplate.js';
import html2pdf from 'html2pdf.js';

// 1. Prepare your quote data
const quoteData = {
  customer: { name: "John Smith", ... },
  salesRep: { name: "Maria Rodriguez", ... },
  quote: { number: "Q-2026-1234", ... },
  screens: [...],
  pricing: { ... }
};

// 2. Generate HTML
const htmlString = generateQuotePDF(quoteData);

// 3. Create PDF
html2pdf().from(htmlString).save('quote.pdf');
```

## Installation

### Option 1: CDN (No build step)

```html
<!-- Add to your HTML -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
<script type="module" src="./pdfTemplate.js"></script>
```

### Option 2: npm (With bundler)

```bash
npm install html2pdf.js
```

```javascript
import html2pdf from 'html2pdf.js';
import { generateQuotePDF } from './pdfTemplate.js';
```

## Data Structure

The `generateQuotePDF()` function accepts a single data object:

```javascript
{
  customer: {
    name: string,           // Required
    company?: string,       // Optional
    address: string,        // Required
    email: string,          // Required
    phone: string           // Required
  },
  salesRep: {
    name: string,           // Required
    email: string,          // Required
    phone: string           // Required
  },
  quote: {
    number: string,         // e.g., "Q-2026-1234"
    date: string,           // e.g., "February 17, 2026"
    validThrough: string    // e.g., "March 17, 2026"
  },
  screens: [
    {
      name: string,         // e.g., "Patio Screen #1"
      track: string,        // e.g., "Recessed"
      operator: string,     // e.g., "Remote Motor"
      fabric: string,       // e.g., "Standard Mesh"
      frame: string,        // e.g., "White"
      width: string,        // e.g., "144\""
      height: string,       // e.g., "96\""
      price1: number,       // Required
      price2?: number       // Optional - only for comparison pricing
    }
  ],
  pricing: {
    materials: number,
    installation: number,
    discountPercent: number,
    discountAmount: number,
    subtotal: number,
    tax: number,
    total: number,
    deposit: number,
    balance: number
  },
  comparisonPricing?: {     // Optional - for side-by-side comparison
    option1Label: string,   // e.g., "Remote Motor"
    option2Label: string,   // e.g., "Solar Motor"
    materials2: number,
    discountAmount2: number,
    subtotal2: number,
    total2: number,
    deposit2: number,
    balance2: number
  },
  logoUrl?: string          // Optional - base64 or URL
}
```

## Usage Examples

### 1. Generate and Download PDF

```javascript
import { generateQuotePDF } from './pdfTemplate.js';

function downloadQuotePDF(quoteData) {
  const htmlString = generateQuotePDF(quoteData);
  
  const opt = {
    margin: 0,
    filename: `Quote-${quoteData.quote.number}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  
  html2pdf().set(opt).from(htmlString).save();
}
```

### 2. Preview in Browser

```javascript
function previewQuote(quoteData) {
  const htmlString = generateQuotePDF(quoteData);
  const win = window.open('', '_blank');
  win.document.write(htmlString);
  win.document.close();
}
```

### 3. Display on Page

```javascript
function showQuoteOnPage(quoteData, containerId) {
  const htmlString = generateQuotePDF(quoteData);
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const pageContent = doc.querySelector('.page');
  
  document.getElementById(containerId).innerHTML = '';
  document.getElementById(containerId).appendChild(pageContent);
}
```

### 4. Email as HTML

```javascript
function getQuoteHTML(quoteData) {
  return generateQuotePDF(quoteData);
  // Send this HTML string via your email service
}
```

## Adding Your Logo

### Method 1: Use Base64 (Recommended)

```javascript
// Convert image to base64 first
function imageToBase64(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = imageUrl;
  });
}

// Use it
const base64Logo = await imageToBase64('/path/to/logo.png');
const quoteData = {
  ...yourData,
  logoUrl: base64Logo
};
```

### Method 2: Use Direct URL

```javascript
const quoteData = {
  ...yourData,
  logoUrl: 'https://yourdomain.com/logo.png'
};
```

## Comparison Pricing

To show side-by-side pricing (e.g., Remote Motor vs Solar Motor):

```javascript
const quoteData = {
  // ... other fields ...
  screens: [
    {
      name: "Patio Screen",
      // ... other fields ...
      price1: 2450.00,      // First option price
      price2: 2850.00       // Second option price
    }
  ],
  comparisonPricing: {
    option1Label: "Remote Motor",
    option2Label: "Solar Motor",
    materials2: 5045.00,
    discountAmount2: 504.50,
    subtotal2: 5340.50,
    total2: 5731.00,
    deposit2: 2865.50,
    balance2: 2865.50
  }
};
```

## Customization

### Change Colors

Edit the hex values in `pdfTemplate.js`:

- **Primary Blue**: `#004a95`
- **Medium Blue**: `#0071bc`
- **Accent Cyan**: `#19cbfa`

### Change Fonts

Replace the Google Fonts import:

```javascript
// Currently using:
// Montserrat (headlines)
// Open Sans (body)
```

### Modify Layout

The template uses inline styles for maximum PDF compatibility. Edit the style attributes directly in the HTML string.

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- IE11: ❌ Not supported (use modern browsers)

## File Structure

```
/src/exports/
  ├── pdfTemplate.js       # Main template function
  ├── example-usage.js     # Usage examples
  └── README.md           # This file
```

## PDF Generation Libraries Supported

1. **html2pdf.js** (Recommended) - Client-side, no server required
2. **jsPDF** - Client-side alternative
3. **Puppeteer** - Server-side (Node.js)
4. **wkhtmltopdf** - Server-side command-line tool

## Troubleshooting

### Logo not showing in PDF

- Convert to base64 instead of URL
- Ensure image is loaded before PDF generation
- Check CORS if loading from external domain

### Fonts look wrong

- Ensure Google Fonts CDN is accessible
- Wait for fonts to load before generating PDF
- Consider embedding fonts as base64

### Layout breaks across pages

- Template is designed for single page
- Reduce number of screens if content overflows
- Consider reducing font sizes for large quotes

### QR Code placeholder

Replace the placeholder div with actual QR code:

```javascript
// Use a library like qrcode.js
import QRCode from 'qrcode';

const qrCodeDataUrl = await QRCode.toDataURL('https://your-payment-link.com');
// Add qrCodeUrl to your data object
```

## Support

For Roll-A-Shield internal use only. Contact your development team for assistance.

## License

Proprietary - Roll-A-Shield © 2026
