/**
 * Example usage of the Roll-A-Shield PDF Template Generator
 * This file demonstrates different ways to use the template in vanilla JS
 */

import { generateQuotePDF, exampleQuoteData } from './pdfTemplate.js';

// ============================================
// METHOD 1: Using html2pdf.js (Recommended)
// ============================================
// Install: npm install html2pdf.js

function generatePDFWithHtml2Pdf(quoteData) {
  // Import html2pdf (add to your HTML or bundle)
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
  
  const htmlString = generateQuotePDF(quoteData);
  
  const opt = {
    margin: 0,
    filename: `Quote-${quoteData.quote.number}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };
  
  // Generate PDF
  html2pdf().set(opt).from(htmlString).save();
}

// ============================================
// METHOD 2: Preview in Browser Window
// ============================================

function previewPDF(quoteData) {
  const htmlString = generateQuotePDF(quoteData);
  
  // Open in new window
  const win = window.open('', '_blank');
  win.document.write(htmlString);
  win.document.close();
  
  // User can then print to PDF (Ctrl+P or Cmd+P)
}

// ============================================
// METHOD 3: Insert into existing page
// ============================================

function insertPDFIntoPage(quoteData, containerId) {
  const htmlString = generateQuotePDF(quoteData);
  const container = document.getElementById(containerId);
  
  // Extract just the page content (without <html>, <head>, <body>)
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');
  const pageContent = doc.querySelector('.page');
  
  container.innerHTML = '';
  container.appendChild(pageContent);
}

// ============================================
// METHOD 4: Generate and download using jsPDF
// ============================================

function generatePDFWithJsPDF(quoteData) {
  // Import jsPDF (add to your HTML or bundle)
  // <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  
  const htmlString = generateQuotePDF(quoteData);
  const { jsPDF } = window.jspdf;
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });
  
  doc.html(htmlString, {
    callback: function(doc) {
      doc.save(`Quote-${quoteData.quote.number}.pdf`);
    },
    x: 0,
    y: 0,
    width: 8.5,
    windowWidth: 816 // 8.5in * 96dpi
  });
}

// ============================================
// METHOD 5: Convert logo to base64
// ============================================

function convertLogoToBase64(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = function() {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const base64 = canvas.toDataURL('image/png');
      resolve(base64);
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

// Usage:
async function generatePDFWithLogo(quoteData, logoImageUrl) {
  const base64Logo = await convertLogoToBase64(logoImageUrl);
  const dataWithLogo = {
    ...quoteData,
    logoUrl: base64Logo
  };
  generatePDFWithHtml2Pdf(dataWithLogo);
}

// ============================================
// EXAMPLE: Basic usage
// ============================================

// Simple preview
document.getElementById('btnPreview')?.addEventListener('click', () => {
  previewPDF(exampleQuoteData);
});

// Generate and download
document.getElementById('btnDownload')?.addEventListener('click', () => {
  generatePDFWithHtml2Pdf(exampleQuoteData);
});

// Custom quote data
const myQuoteData = {
  customer: {
    name: "Jane Doe",
    address: "5678 Main St, Phoenix, AZ 85001",
    email: "jane@example.com",
    phone: "(602) 555-9876"
  },
  salesRep: {
    name: "Bob Johnson",
    email: "bob@rollashield.com",
    phone: "(480) 921-0200"
  },
  quote: {
    number: "Q-2026-5678",
    date: "February 17, 2026",
    validThrough: "March 17, 2026"
  },
  screens: [
    {
      name: "Front Patio",
      track: "Recessed",
      operator: "Remote Motor",
      fabric: "Solar Screen 90%",
      frame: "White",
      width: "180\"",
      height: "108\"",
      price1: 3250.00
    }
  ],
  pricing: {
    materials: 3250.00,
    installation: 400.00,
    discountPercent: 0,
    discountAmount: 0,
    subtotal: 3650.00,
    tax: 328.50,
    total: 3978.50,
    deposit: 1989.25,
    balance: 1989.25
  }
};

// Generate custom quote
document.getElementById('btnCustom')?.addEventListener('click', () => {
  generatePDFWithHtml2Pdf(myQuoteData);
});
