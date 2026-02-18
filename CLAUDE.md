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
- **Hosting**: GitHub Pages (frontend), Cloudflare (worker)

## Key Endpoints (Cloudflare Worker)
- POST /api/send-email - Send quote/production email via Resend
- POST /api/save-quote - Save quote to D1
- GET /api/quotes - List all quotes
- GET /api/quote/:id - Get specific quote
- GET /api/quote/:id/customer-view - Public quote data for sign/pay pages
- POST /api/quote/:id/sign - Submit signature (in-person)
- POST /api/send-for-signature - Send signing link email to customer
- POST /api/quote/:id/submit-remote-signature - Submit remote signature (via token)
- GET /api/payment-info - Static payment method details (ACH, check, Zelle, Clover)
- POST /api/quote/:id/create-echeck-session - Create Stripe Checkout session for eCheck/ACH

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
- `sign.html` — Customer signature page (in-person via `?quoteId=&mode=in-person`, remote via `?token=`)
- `pay.html` — Payment instructions page (multi-method: Clover CC, Stripe eCheck, ACH, Zelle, check)
- `finalize.html` — Final measurements and production order form

### Design docs
- PDF template: `docs/pdf-template-plan.md`
- Signature & payment feature: `docs/signature-feature-plan.md`

## Payments
- **Clover**: Credit card via static permanent payment link (configured in `/api/payment-info`)
- **Stripe**: eCheck/ACH via Checkout Sessions (`us_bank_account` payment method)
  - Worker secret: `STRIPE_SECRET_KEY` (set via `wrangler secret put STRIPE_SECRET_KEY`)
  - Creates Stripe Customer with name/email for pre-population
  - Endpoint: `POST /api/quote/:id/create-echeck-session`
- **ACH / Zelle / Check**: Static payment instructions displayed on pay.html (no API integration)

## Important Notes
- This is a vanilla JS project. Do NOT suggest adding npm, webpack, React, or any framework.
- All pricing logic is in `pricing-data.js`. If pricing changes, update ONLY that file.
- The D1 database ID is in `wrangler.toml`. This is a Cloudflare resource identifier, not a secret.
