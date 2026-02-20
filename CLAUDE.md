# Screen Quote Tool

## Overview
Web application for generating custom rolling screen quotes with email integration and cloud database storage. Used by Roll-A-Shield sales reps to create quotes for customers.

## Architecture
- **Frontend**: Vanilla HTML/CSS/JavaScript (NO build tools, NO framework)
  - `index.html` - Quote generation UI (main page)
  - `sign.html` - Customer signature page
  - `pay.html` - Payment instructions page
  - `finalize.html` - Final measurements and production order form
  - `styles.css` - Shared styles
  - `nav-steps.css` / `nav-steps.js` - Step navigation bar (shared across sign/pay/finalize)
  - `app.js` - Core application logic
  - `sign.js` - Signature page logic
  - `pay.js` - Payment page logic
  - `pricing-data.js` - Pricing tables and product constants
  - `email-templates.js` - Email HTML template generation
  - `pdf-template.js` - PDF quote template (html2pdf.js, converted from Figma)
- **Backend**: Cloudflare Worker (`cloudflare-worker.js`)
  - Deployed as `rollashield-quote-worker`
  - Secrets managed via `wrangler secret put` (never in code)
- **Database**: Cloudflare D1 (`rollashield_quotes`, schema in `d1-schema.sql`)
- **File Storage**: Cloudflare R2 (`PHOTO_BUCKET` binding) for site photos
- **Hosting**: GitHub Pages (frontend), Cloudflare (worker)

## Key Endpoints (Cloudflare Worker)

### Quotes
- POST /api/save-quote - Save quote to D1
- GET /api/quotes - List all quotes
- GET /api/quote/:id - Get specific quote
- GET /api/quote/:id/customer-view - Public quote data for sign/pay pages

### Email
- POST /api/send-email - Send quote/production email via Resend

### Signing
- POST /api/quote/:id/sign - Submit signature (in-person)
- POST /api/send-for-signature - Send signing link email to customer
- POST /api/quote/:id/submit-remote-signature - Submit remote signature (via token)

### Payments
- GET /api/payment-info - Static payment method details (ACH, check, Zelle, Clover)
- POST /api/quote/:id/create-echeck-session - Create Stripe Checkout session for eCheck/ACH (accepts `{ paymentType: 'deposit' | 'full' }` in request body)

### Photos (R2)
- POST /api/photos/upload - Upload site photo to R2 (JPEG, PNG, HEIC; max 5MB)
- POST /api/photos/delete - Delete site photo from R2
- GET /r2/quotes/* - Serve photo from R2

### Airtable Integration
- GET /api/airtable/opportunities/search?q=<query> - Search Airtable opportunities by name (filters out "Closed Lost")
- GET /api/airtable/sales-reps - List all sales reps from Airtable
- POST /api/airtable/opportunities/update-rep - Assign sales rep to an Airtable opportunity

## Development
- No build step. Open HTML files directly or use a local server.
- Worker dev: `wrangler dev` (starts local worker on port 8787)
- When testing locally, update WORKER_URL in HTML files to http://localhost:8787

## Deployment
- Frontend: Push to `main` -> GitHub Pages deploys automatically
- Backend: `wrangler deploy` from this directory
- Secrets (via `wrangler secret put`):
  - `RESEND_API_KEY` — Resend transactional email
  - `STRIPE_SECRET_KEY` — Stripe eCheck/ACH payments
  - `AIRTABLE_API_KEY` — Airtable CRM integration
- Bindings (in `wrangler.toml`):
  - `DB` — D1 database (`rollashield_quotes`)
  - `PHOTO_BUCKET` — R2 bucket for site photos

## Email (Resend)
Transactional email sent via [Resend](https://resend.com) API through the Cloudflare Worker.

- **Sending domain**: `updates.rollashield.com` (SPF, DKIM, MX verified)
- **From address**: `noreply@updates.rollashield.com`
- **Worker secret**: `RESEND_API_KEY` (set via `wrangler secret put RESEND_API_KEY`)
- **Dashboard**: https://resend.com/domains — domain verification, delivery logs

### Email sending locations
| File | Function/Context | Display Name | Purpose |
|------|-----------------|--------------|---------|
| `cloudflare-worker.js` | `handleSendEmail()` | Roll-A-Shield | Quote PDF email to customer |
| `cloudflare-worker.js` | `handleSendForSignature()` | Roll-A-Shield | Signing link email to customer |
| `cloudflare-worker.js` | `handleSubmitRemoteSignature()` | Roll-A-Shield | Signature confirmation to sales rep |
| `email-templates.js` | `buildEmailPayload()` | Roll-A-Shield Quotes | Quote email (called by app.js) |
| `finalize.html` | inline `sendProductionEmail()` | Roll-A-Shield Production | Production order email |

## Pages & Flows
- `index.html` — Quote builder (sales rep tool)
  - **Two-phase screen entry workflow:**
    - **Phase 1 "Document Opening"**: Name, dimensions, frame color, installation/wiring, photos — captured on-site walking each opening
    - **Phase 2 "Configure Screens"**: Track type, operator/motor, fabric, accessories — applied in batch to selected openings after all are measured
    - Opening cards (amber/dashed) vs configured cards (blue/solid) with status bar
    - Batch configuration: select multiple openings → apply same config to all at once
    - Single-pass still supported: if all fields filled, "Add to Order" creates configured screen directly
    - Draft save: save after Phase 1 only (`orderTotalPrice: 0`), load later to finish configuration
    - `calculateOrderQuote()` blocks if any screens have `phase: 'opening'`
  - **Screen object states**: `phase: 'opening'` (Phase 1 only, no pricing) or `phase: 'configured'` (full pricing)
  - **Key functions**: `addOpening()`, `applyConfiguration()`, `computeScreenPricing()` (pure, no DOM), `saveDraft()`
  - Airtable opportunity search & auto-fill customer info
  - Sales rep selection (synced from Airtable)
  - Screen-level accessories (per screen, in Phase 2)
  - Project-level accessories (per order, with quantities)
  - Site photo upload (stored in R2, captured in Phase 1)
  - 4-Week Install Guarantee option (in Phase 2; restricts to Gaposa motors, solar priced at RTS rate)
  - Dimension validation warnings (max width/height by track type, shown when track selected)
  - PDF generation via html2pdf.js + pdf-template.js
  - Combined "Send Quote + Send for Signature" action
  - Duplicate/edit/remove screens
- `sign.html` — Customer signature page (in-person via `?quoteId=&mode=in-person`, remote via `?token=`)
  - Renders quote PDF template inline for review
  - Uses `signature_pad` v4.2.0 for signature capture
  - Shows deposit amount (50%) and payment terms
- `pay.html` — Payment page with deposit/full toggle
  - Toggle between 50% deposit and full payment amount
  - Multi-method: Clover CC, Stripe eCheck, ACH, Zelle (with QR code), check
  - Stripe eCheck sessions dynamically priced based on deposit/full selection
- `finalize.html` — Final measurements and production order form
  - Opening measurements (width top/middle/bottom, height left/middle/right)
  - Sunair ordering measurements auto-calculated: +5" width (tracks), +7.25" height (wall mount) or +5.25" (ceiling mount)
  - Fenetex alert: measurements are opening-only, Production adds track/headbox dims
  - Difficult Install checkbox (flags production email with red banner + subject line prefix)
  - Production comments textarea
  - Sends production email to production team

### Draft/unconfigured quote guards
All downstream pages and worker endpoints block draft quotes with unconfigured openings:
- `sign.js` — `renderQuote()` shows "Quote Not Ready" message
- `pay.js` — `populatePage()` shows "Quote Not Ready" message
- `finalize.html` — `loadOrderData()` redirects to index.html with alert
- `cloudflare-worker.js` — `handleSendForSignature()` returns 400 error
- `app.js` — `mapOrderDataToTemplate()` throws error (blocks PDF generation)

### Backward compatibility
Existing saved quotes (no `phase` field on screens) default to `phase: 'configured'` when loaded.

### Design docs (historical — features are implemented)
- PDF template: `docs/pdf-template-plan.md`
- Signature & payment feature: `docs/signature-feature-plan.md`
- Two-phase screen entry: `.claude/plans/synthetic-baking-pine.md`

## Payments
- **Clover**: Credit card via static permanent payment link (configured in `/api/payment-info`)
- **Stripe**: eCheck/ACH via Checkout Sessions (`us_bank_account` payment method)
  - Worker secret: `STRIPE_SECRET_KEY` (set via `wrangler secret put STRIPE_SECRET_KEY`)
  - Creates Stripe Customer with name/email for pre-population
  - Endpoint: `POST /api/quote/:id/create-echeck-session`
  - Accepts `{ paymentType: 'deposit' | 'full' }` to set session amount
- **ACH / Zelle / Check**: Static payment instructions displayed on pay.html (no API integration)
- **Deposit**: Always 50% of total quote price

## D1 Database
Schema in `d1-schema.sql`. Key columns beyond basic quote data:
- **Signing**: `quote_status`, `signing_token`, `signature_data`, `signed_at`, `signer_name`, `signer_ip`, `signing_method`
- **Guarantee**: `four_week_guarantee`, `total_guarantee_discount`
- **Photos**: Stored in R2 (key format: `quotes/{quoteId}/screens/{screenIndex}/{timestamp}-{randomId}.{ext}`)

## Important Notes
- This is a vanilla JS project. Do NOT suggest adding npm, webpack, React, or any framework.
- All pricing logic is in `pricing-data.js`. If pricing changes, update ONLY that file.
- The D1 database ID is in `wrangler.toml`. This is a Cloudflare resource identifier, not a secret.
- Motor pricing: `gaposa-rts` $225, `gaposa-solar` $425, `somfy-rts` $375. Customer markup: 1.8x.
- 4-Week Install Guarantee: solar motors priced at RTS rate → saves ($425-$225) × 1.8 = $360/screen. Somfy excluded.
