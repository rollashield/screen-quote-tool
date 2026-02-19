# Customer Signature Step — Implementation Plan

> **Status**: ✅ Completed — `sign.html`, `sign.js` implemented with in-person + remote signing flows
> **Created**: 2026-02-16
> **Replaces**: PandaDoc e-signature workflow
> **Depends on**: PDF template integration (`docs/pdf-template-plan.md`) — uses same Figma-designed template as the visual foundation

## Context
The screen quote tool currently goes straight from quote creation to production finalization. There's no customer acceptance/signature step. Roll-A-Shield currently uses PandaDoc for e-signatures, which is too expensive for the value it provides. This plan adds a lightweight self-hosted signature step that supports two scenarios:
1. **In-person**: Customer signs on the sales rep's iPad at the job site
2. **Remote**: Customer receives an email link, reviews the quote, and signs online

No frameworks, no accounts for the customer, no third-party signing service. Customers sign on an HTML web page (same approach as DocuSign/PandaDoc under the hood). The legally binding record is the displayed terms + captured signature + audit trail in D1.

---

## Design Decisions
- **Finalize gate**: Warning only — allow proceeding to production finalization without signature
- **Deposit display**: Show 50/50 split (50% deposit due at signing, 50% balance at completion)
- **Signature library**: `signature_pad` v4.2.0 from jsdelivr CDN (~30KB, zero dependencies, touch/stylus/mouse)
- **Signing format**: HTML web page (not PDF) — same legal validity, much simpler to build
- **Visual design**: Reuse the Figma PDF template (`generateQuotePDF()` from `pdf-template.js`) as the foundation for the signing page's quote display. This ensures the customer sees the same professional layout on the signing page as in the downloaded PDF — consistent branding, same pricing table, same warranty text, same terms & conditions. The signing page wraps the template's HTML output and appends the interactive signature section below it.

---

## New Files

### `sign.html` + `sign.js`
Customer-facing signing page. Serves both flows via URL params:
- **Remote**: `sign.html?token=<signing_token>` → fetches via `GET /api/sign/:token`
- **In-person**: `sign.html?quoteId=<id>&mode=in-person` → fetches via `GET /api/quote/:id/customer-view`

**Visual design approach**: The signing page reuses `generateQuotePDF()` from `pdf-template.js` to render the quote content (header, customer info, screen table, pricing, warranty, terms). This is the same Figma-designed template used for PDF downloads. The signing page then replaces the template's static signature placeholder block with an interactive signature section:

**Page structure:**
1. **Quote display** — rendered by calling `generateQuotePDF(quoteData)` and extracting the `.page` content via DOMParser. This renders the full branded quote: header with logo, customer/sales rep info, screen product table, pricing with deposit/balance, warranty, and terms & conditions. The static "Customer Signature" placeholder box from the template is hidden/removed.
2. **Interactive signature section** (appended below the quote):
   - Acceptance checkbox: "I have read and accept this quote and authorize Roll-A-Shield to perform the work as described above."
   - Typed name input
   - Signature canvas (`signature_pad` from CDN — handles touch/stylus/mouse with smoothing)
   - "Accept & Sign" button (disabled until checkbox checked + name filled + signature drawn)
3. **Post-sign**: Confirmation screen; in-person mode shows "Back to Quote Tool" / "Proceed to Finalize" links

**Data mapping**: The signing page uses the same `mapOrderDataToTemplate()` function from `app.js` (or a copy of it in `sign.js`) to transform the API response into the template's expected data shape. This ensures the signing page renders identically to the PDF.

**Dependencies** (all CDN):
- `signature_pad` v4.2.0 from jsdelivr (~30KB) — signature capture
- `pdf-template.js` — quote display template (shared with PDF generation)
- Google Fonts: Montserrat + Open Sans (same preload as index.html)

### `migration-signature.sql`
D1 migration (follows existing `migration-airtable.sql` pattern):
```sql
ALTER TABLE quotes ADD COLUMN quote_status TEXT DEFAULT 'draft';
ALTER TABLE quotes ADD COLUMN signing_token TEXT;
ALTER TABLE quotes ADD COLUMN signing_token_expires_at TEXT;
ALTER TABLE quotes ADD COLUMN signature_data TEXT;
ALTER TABLE quotes ADD COLUMN signed_at TEXT;
ALTER TABLE quotes ADD COLUMN signer_name TEXT;
ALTER TABLE quotes ADD COLUMN signer_ip TEXT;
ALTER TABLE quotes ADD COLUMN signing_method TEXT;  -- 'in-person' or 'remote'
ALTER TABLE quotes ADD COLUMN signature_sent_at TEXT;

CREATE UNIQUE INDEX idx_quotes_signing_token ON quotes(signing_token);
CREATE INDEX idx_quotes_quote_status ON quotes(quote_status);
```

**Column details:**

| Column | Type | Purpose |
|---|---|---|
| `quote_status` | TEXT | Lifecycle: `draft` → `sent` → `viewed` → `signed` → `finalized` (or `expired`) |
| `signing_token` | TEXT | 64-char hex string (32 bytes crypto random) for remote signing URLs |
| `signing_token_expires_at` | TEXT | ISO timestamp, default 30 days from creation |
| `signature_data` | TEXT | Base64-encoded PNG of signature from canvas (~10-50KB typical) |
| `signed_at` | TEXT | ISO timestamp of signature capture |
| `signer_name` | TEXT | Customer's typed name alongside drawn signature |
| `signer_ip` | TEXT | IP from `CF-Connecting-IP` header (audit trail) |
| `signing_method` | TEXT | `in-person` or `remote` |
| `signature_sent_at` | TEXT | ISO timestamp of when signing email was sent |

---

## Modified Files

### `cloudflare-worker.js` — 5 new endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/quote/:id/send-for-signature` | Generate signing token, save to D1, email link to customer via Resend |
| `GET` | `/api/quote/:id/customer-view` | Return quote data with internal costs/margins/comments stripped |
| `GET` | `/api/sign/:token` | Validate token + expiry, return customer-safe quote data, mark as `viewed` |
| `POST` | `/api/sign/:token` | Submit remote signature, store in D1, update status, email sales rep |
| `POST` | `/api/quote/:id/sign-in-person` | Submit in-person signature, store in D1, update status |

**Token generation**: `crypto.getRandomValues(new Uint8Array(32))` → hex encode → 64-char token. 30-day default expiry. The token IS the auth — no login/account needed for customers.

**Data safety**: Both customer-facing GET endpoints MUST strip internal data before returning:
- Remove: `orderTotalCost`, `orderTotalInstallationCost`, `totalProfit`, `marginPercent`, `totalScreenCosts`, `internalComments`, per-screen `screenCostOnly`/`motorCost`
- Keep: `orderTotalPrice`, `orderTotalMaterialsPrice`, `orderTotalInstallationPrice`, discount fields, customer info, screen specs

### `index.html` — 2 new buttons
Add to the existing button group (after "Email Quote", before "Finalize Project Details"):
```html
<button class="btn-success" onclick="presentForSignature()">Present for Signature</button>
<button class="btn-primary" onclick="sendForSignature()">Send for Signature</button>
```
Both require the quote to be saved first (same guard pattern as the Finalize button).

### `app.js` — 2 new functions
- `presentForSignature()` — Validates quote is saved (has `id`), navigates to `sign.html?quoteId=<id>&mode=in-person`
- `sendForSignature()` — Validates quote is saved + customer email exists, confirms email address, calls `POST /api/quote/:id/send-for-signature`, shows success/failure message

### `email-templates.js` — 2 new email template functions
- `generateSignatureRequestEmail(quoteData, signingUrl)` — Email to customer with:
  - "Review & Sign Your Quote" CTA button
  - Brief summary (screen count, total, deposit amount)
  - 30-day validity notice
  - Sales rep contact info
- `generateSignatureConfirmationEmail(quoteData, signatureInfo)` — Email to sales rep:
  - "[Customer Name] has signed Quote [Q####-###]"
  - Signing timestamp and method

### `d1-schema.sql` — Update canonical schema with new columns

### `finalize.html` — Warning banner
On load, check `quote_status` from loaded quote data. If not `signed`, show a dismissible yellow warning banner: "This quote has not been signed by the customer yet." Proceeding is allowed.

### `styles.css` — Signing page styles
Signature canvas styling, responsive layout for iPad, acceptance section, confirmation screen, warning banner for finalize page.

---

## Flow: In-Person Signing

1. Sales rep creates & saves quote as normal in `index.html`
2. Clicks **"Present for Signature"** in quote summary
3. Browser navigates to `sign.html?quoteId=<id>&mode=in-person`
4. Page fetches quote via `GET /api/quote/:id/customer-view` (internal data stripped server-side)
5. Customer reviews quote on iPad: screens, pricing, deposit/balance, warranty, terms
6. Customer checks acceptance box, types their name, draws signature on canvas
7. Taps **"Accept & Sign"** → `POST /api/quote/:id/sign-in-person`
8. Confirmation screen appears; sales rep navigation links shown only after signing completes
9. Sales rep takes iPad back, proceeds to Finalize or returns to quote tool

## Flow: Remote Signing

1. Sales rep creates & saves quote as normal in `index.html`
2. Clicks **"Send for Signature"** → confirms customer email address
3. App calls `POST /api/quote/:id/send-for-signature` → worker generates token, stores in D1, sends email via Resend
4. Customer receives email with **"Review & Sign Your Quote"** button
5. Customer clicks link → `sign.html?token=<token>`
6. Page fetches quote via `GET /api/sign/:token` (validates token + checks expiry, updates status to `viewed`)
7. Customer reviews, checks acceptance, types name, draws signature
8. Submits → `POST /api/sign/:token`
9. Worker stores signature, updates status to `signed`, sends confirmation email to sales rep
10. Customer sees "Thank you" confirmation page
11. Sales rep receives email notification and can proceed to finalize when ready

---

## Security Considerations

- **Token entropy**: 256 bits (32 bytes) — brute force infeasible
- **Token expiry**: Enforced server-side on every GET and POST; expired returns HTTP 410
- **No auth required**: Token IS the credential (same model as DocuSign/PandaDoc)
- **Already-signed guard**: If `quote_status` is already `signed`, POST returns 409; GET shows read-only signed state
- **IP logging**: `CF-Connecting-IP` header captured for audit trail
- **CORS**: Existing `Access-Control-Allow-Origin: *` on worker handles GitHub Pages cross-origin
- **Data stripping**: Internal costs/margins never exposed to customer-facing endpoints
- **Airtable sync**: On signature capture, update Airtable quote status to "Accepted" if linked (non-fatal)

---

## Implementation Order

**Phase 1 — Database & Worker (backend)**
1. Create `migration-signature.sql` and run against D1
2. Update `d1-schema.sql` with new columns
3. Add all 5 endpoints to `cloudflare-worker.js`
4. Test endpoints with curl

**Phase 2 — Signing page (new files)**
5. Create `sign.html` with full responsive layout
6. Create `sign.js` with signature pad integration, quote rendering, submission logic
7. Add signing-related styles to `styles.css`

**Phase 3 — Integration (existing files)**
8. Add "Present for Signature" and "Send for Signature" buttons to `index.html`
9. Add `presentForSignature()` and `sendForSignature()` to `app.js`
10. Add email template functions to `email-templates.js`
11. Add unsigned-quote warning to `finalize.html`

**Phase 4 — Testing**
12. Test in-person flow end-to-end
13. Test remote flow end-to-end (email delivery + signing)
14. Test on iPad Safari (touch signature input)
15. Test token expiration handling
16. Test already-signed state display
17. Deploy worker with `wrangler deploy`

---

## Verification Checklist
- [ ] In-person: Create quote → Present for Signature → sign → verify D1 updated → finalize shows no warning
- [ ] Remote: Create quote → Send for Signature → email received → click link → sign → sales rep gets confirmation → D1 updated
- [ ] Expiration: Set token expiry to past → signing page shows "expired" message
- [ ] Already signed: Visit signing link for signed quote → shows read-only signed state
- [ ] Finalize warning: Load finalize for unsigned quote → yellow warning appears, can be dismissed
- [ ] iPad: Test sign.html on iPad Safari — signature pad handles touch/stylus correctly
- [ ] Data safety: Inspect `GET /api/sign/:token` response → no internal costs/margins present

---

## Future: Payment Collection

> **Status**: ✅ Completed — `pay.html`, `pay.js` implemented with multi-method payments and deposit/full toggle
> **Context**: Roll-A-Shield uses Clover for POS. Clover passes the 3% CC surcharge to customers automatically. Stripe has lower ACH/bank transfer fees but doesn't pass CC surcharges. Solution: use both processors for what they're best at.

### Payment Strategy — Multi-Method

The payment page offers customers **5 ways to pay their deposit**, using the best processor for each:

| Method | Processor | API-Driven? | Customer Fee | Notes |
|--------|-----------|-------------|-------------|-------|
| **Credit Card (live, in-person)** | Clover Hosted Checkout API | Yes | 3% surcharge | Surcharge passed automatically by Clover |
| **Credit Card (remote/later)** | Clover Payment Link (manual) | No — sales rep creates in Clover Dashboard, pastes URL | 3% surcharge | Same surcharge via Clover |
| **Debit Card (live, in-person)** | Clover Hosted Checkout API | Yes | No fee | Contact bank for max transfer amounts |
| **Debit Card (remote/later)** | Clover Payment Link (manual) | No | No fee | Contact bank for max transfer amounts |
| **Bank Transfer** | Stripe | Yes — Stripe Invoices API or Payment Links | No fee | Contact bank for max transfer amounts |
| **Direct ACH** | N/A (instructions only) | No | No fee | — |
| **Check** | N/A (instructions only) | No | No fee | May cause delays in releasing order |
| **Zelle** | N/A (instructions only) | No | No fee | Typically $2.5-3.5k max depending on bank |

### Customer-Facing Payment Page

After signing the quote, the customer sees a payment page (or section on the confirmation page) with:

```
╔══════════════════════════════════════════════════════╗
║  DEPOSIT PAYMENT — $5,213.75                         ║
║  Quote Q2502-001 | John & Jane Smith                 ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  💳 PAY BY CREDIT CARD                               ║
║  [Pay with Credit Card →]                            ║
║  A 3% processing fee will be applied.                ║
║                                                      ║
║  💳 PAY BY DEBIT CARD                                ║
║  [Pay with Debit Card →]                             ║
║  No fee. Contact your bank for max transfer amounts. ║
║                                                      ║
║  🏦 PAY BY BANK TRANSFER                             ║
║  [Pay via Bank Transfer →]                           ║
║  No fee. Contact your bank for max transfer amounts. ║
║  Processed securely via Stripe.                      ║
║                                                      ║
║  OTHER PAYMENT OPTIONS                               ║
║  ┌──────────────────────────────────────────────┐    ║
║  │ ACH Direct Deposit                           │    ║
║  │ Bank: Zions Bancorporation DBA               │    ║
║  │       National Bank of Arizona               │    ║
║  │ Account Holder: Roll A Shield, LLC           │    ║
║  │ Routing: ****5320                            │    ║
║  │ Account: ****2549                            │    ║
║  │ Reference: Q2502-001                         │    ║
║  ├──────────────────────────────────────────────┤    ║
║  │ Check                                        │    ║
║  │ Make payable to: Roll-A-Shield               │    ║
║  │ Mail to: 2680 S. Industrial Park Ave         │    ║
║  │          Tempe, AZ 85282                     │    ║
║  │ Memo: Q2502-001                              │    ║
║  │ ⚠ Paying by check may cause delays in        │    ║
║  │   releasing your order.                      │    ║
║  ├──────────────────────────────────────────────┤    ║
║  │ Zelle                                        │    ║
║  │ Send to: ap@rollashield.com                  │    ║
║  │ Reference: Q2502-001                         │    ║
║  │ [QR CODE]                                    │    ║
║  │ Typically $2.5-3.5k max depending on bank    │    ║
║  └──────────────────────────────────────────────┘    ║
║                                                      ║
╚══════════════════════════════════════════════════════╝
```

> **Note on sensitive data**: The full routing and account numbers should be stored as worker environment variables (`PAYMENT_ACH_ROUTING`, `PAYMENT_ACH_ACCOUNT`), not hardcoded in client-side code. The payment page fetches them from a worker endpoint at render time. The mockup above shows masked values — the actual page will display full numbers since the customer needs them to make a transfer.
>
> **Zelle QR code**: The existing Zelle QR code image should be saved to the project as `assets/zelle-qr.png` and displayed inline on the payment page. This is a static QR (unlike the dynamically generated Clover/Stripe QR codes).

### API Integrations Required

#### 1. Clover Hosted Checkout (live CC/debit — in-person on iPad)
- **When**: Sales rep is present, customer wants to pay deposit immediately after signing
- **How**: Worker calls `POST /invoicingcheckoutservice/v1/checkouts`, redirects to Clover's hosted page
- **Credit vs Debit**: Clover handles both through the same checkout flow. The 3% surcharge is applied automatically by Clover only to credit card transactions — debit cards pay no surcharge. The payment page should explain this distinction clearly to customers.
- **Session expiry**: 15 minutes — fine for live/in-person since customer is paying right now
- **Endpoint**: `POST /invoicingcheckoutservice/v1/checkouts`
- **Auth**: `Bearer {privateKey}` + `X-Clover-Merchant-Id: {merchantId}`
- **Prices**: Cents ($2,850.00 = `285000`)
- **Tax rates**: Integer format (8.6% = `8600000`)
- **Sandbox**: `https://apisandbox.dev.clover.com/invoicingcheckoutservice/v1/checkouts`
- **Production**: `https://api.clover.com/invoicingcheckoutservice/v1/checkouts`
- **New credentials needed**: `CLOVER_PRIVATE_KEY`, `CLOVER_MERCHANT_ID` → add to `.secrets/.env.shared`

#### 2. Clover Payment Link (remote CC — customer pays later)
- **When**: Customer wants to pay by card but isn't paying right now, or when the 15-min Hosted Checkout session would expire
- **How**: Sales rep manually creates payment link in Clover Dashboard, pastes URL into quote tool
- **No API work needed** — just a URL field in the quote record and a place to display it on the payment page
- **Permanent payment link**: `https://link.clover.com/urlshortener/rbRB6n` — this is a reusable Clover payment link with no expiration. Can be used as a fallback for any card payment that extends beyond the 15-min Hosted Checkout window. Consider using this as the default remote CC option instead of generating per-quote Hosted Checkout sessions.
- **New D1 column**: `clover_payment_link TEXT` on quotes table (defaults to the permanent link above, can be overridden per-quote if needed)

#### 3. Stripe Bank Transfer / ACH
- **When**: Customer wants to pay via bank transfer (no surcharge)
- **How**: Worker calls Stripe API to create a Payment Intent or Invoice with `payment_method_types: ['us_bank_account']`
- **Stripe sends** the customer a hosted link or we embed it
- **Existing credentials**: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` already in `.secrets/.env.shared`
- **Webhook**: Stripe notifies worker when payment completes → update D1

#### 4. Manual Methods (ACH instructions, Check, Zelle)
- **No API** — static display only
- **Config**: Store payment instructions as worker environment variables (not hardcoded in HTML since they may change):
  - `PAYMENT_ACH_BANK`: Zions Bancorporation DBA National Bank of Arizona
  - `PAYMENT_ACH_HOLDER`: Roll A Shield, LLC
  - `PAYMENT_ACH_ROUTING`: (stored in wrangler secrets)
  - `PAYMENT_ACH_ACCOUNT`: (stored in wrangler secrets)
  - `PAYMENT_CHECK_ADDRESS`: 2680 S. Industrial Park Ave, Tempe, AZ 85282
  - `PAYMENT_ZELLE_USERNAME`: ap@rollashield.com
- **Zelle QR code**: Static image at `assets/zelle-qr.png` — displayed alongside Zelle instructions
- **Zelle limit note**: Display "Typically $2.5-3.5k max, depending on your bank"
- **Check delay warning**: Display "Paying by check may cause delays in releasing your order."
- **Debit/Bank transfer note**: Display "Contact your bank for maximum transfer amounts."
- **Quote reference**: Always display the quote number so payments can be matched
- **New worker endpoint**: `GET /api/payment-info` — returns non-sensitive payment instructions (bank name, holder, address, Zelle username) plus the ACH routing/account numbers. This keeps the data server-managed so it can be updated without redeploying the frontend.

### New Database Columns (for payment tracking)

```sql
ALTER TABLE quotes ADD COLUMN payment_status TEXT DEFAULT 'unpaid';
ALTER TABLE quotes ADD COLUMN payment_method TEXT;
ALTER TABLE quotes ADD COLUMN payment_amount REAL;
ALTER TABLE quotes ADD COLUMN payment_date TEXT;
ALTER TABLE quotes ADD COLUMN clover_payment_link TEXT;
ALTER TABLE quotes ADD COLUMN stripe_payment_intent_id TEXT;
ALTER TABLE quotes ADD COLUMN clover_checkout_id TEXT;
```

Payment statuses: `unpaid` → `partial` → `paid`

### QR Code Payment Flow (In-Person)

When the sales rep is with the customer on-site, instead of handing over the iPad, the app generates a **QR code on the iPad screen** that the customer scans with their own phone to pay.

**Flow:**
1. Customer signs quote on iPad
2. Sales rep taps "Collect Deposit" → selects CC or Bank Transfer
3. App calls Cloudflare Worker → Worker creates Clover or Stripe checkout session → returns URL
4. App generates QR code from the URL and displays it in a full-screen modal on the iPad
5. Customer scans QR with phone camera → Clover/Stripe checkout opens on their phone
6. Customer pays on their own device
7. App polls for payment confirmation or receives webhook → shows success

**QR Library — two options (both CDN, zero dependencies):**

| Library | CDN | Size | Best For |
|---------|-----|------|----------|
| **QRCode.js** (davidshimjs) | `https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` | ~6KB gzipped | Simple, fast, canvas-based — recommended |
| **qr-code-styling** (kozakdenys) | `https://unpkg.com/qr-code-styling@1.5.0/lib/qr-code-styling.js` | ~47KB | Branded QR with Roll-A-Shield logo + custom colors |

QR codes are generated **entirely client-side** (no server call for the QR itself). Recommended size: **300×300px** with error correction level H (highest). Scans reliably from 2-3 feet on iPad Retina.

**Platform compatibility confirmed:**
- **Clover**: Hosted checkout URL is mobile-responsive, supports Apple Pay / Google Pay on phone. **15-min session expiry** — generate on demand (fine since customer is present).
- **Stripe**: Checkout session URL is mobile-responsive, supports Apple Pay / Google Pay. **24-hour expiry** (configurable). Stripe Payment Links never expire.

### Implementation Order (after signature step is complete)

1. Add payment DB columns (migration)
2. Build payment page UI (`pay.html` + `pay.js`) with all 5 methods displayed
3. Add QR code library (QRCode.js from CDN) + QR display modal
4. Add Clover Hosted Checkout endpoint to worker (for live CC)
5. Add Stripe bank transfer endpoint to worker (for ACH)
6. Add Clover payment link field to quote save/load flow
7. Add payment status tracking + webhook endpoints
8. Wire payment page into post-signature flow
9. Add payment status display to saved quotes list

### Assets to Add

| File | Source | Purpose |
|------|--------|---------|
| `assets/zelle-qr.png` | User-provided Zelle QR code image | Static QR code displayed on payment page for Zelle payments (ap@rollashield.com) |

### Credentials to Set Up

| Service | Key | Location | Notes |
|---------|-----|----------|-------|
| Clover | `CLOVER_PRIVATE_KEY` | `.secrets/.env.shared` + `wrangler secret put` | Ecommerce API private key from Clover Dashboard |
| Clover | `CLOVER_MERCHANT_ID` | `.secrets/.env.shared` + `wrangler secret put` | Merchant ID from Clover Dashboard |
| Stripe | `STRIPE_SECRET_KEY` | Already exists in `.secrets/.env.shared` | Verify account is active + ACH enabled |
| Stripe | `STRIPE_WEBHOOK_SECRET` | `.secrets/.env.shared` + `wrangler secret put` | For verifying webhook signatures |
| Payment Info | `PAYMENT_ACH_ROUTING` | `wrangler secret put` | ACH routing number (sensitive) |
| Payment Info | `PAYMENT_ACH_ACCOUNT` | `wrangler secret put` | ACH account number (sensitive) |
| Payment Info | `PAYMENT_ACH_BANK` | Worker env var (wrangler.toml `[vars]`) | "Zions Bancorporation DBA National Bank of Arizona" |
| Payment Info | `PAYMENT_ACH_HOLDER` | Worker env var (wrangler.toml `[vars]`) | "Roll A Shield, LLC" |
| Payment Info | `PAYMENT_CHECK_ADDRESS` | Worker env var (wrangler.toml `[vars]`) | "2680 S. Industrial Park Ave, Tempe, AZ 85282" |
| Payment Info | `PAYMENT_ZELLE_USERNAME` | Worker env var (wrangler.toml `[vars]`) | "ap@rollashield.com" |
