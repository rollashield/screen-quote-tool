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
- POST /api/send-email - Send quote/production email via Resend (optional `quoteId` + `emailType` to store email record)
- GET /api/quote/:id/emails - Get sent email records for a quote (from `sent_emails_json`)

### Signing
- POST /api/quote/:id/sign - Submit signature (in-person)
- POST /api/send-for-signature - Send signing link email to customer
- POST /api/quote/:id/submit-remote-signature - Submit remote signature (via token)

### Payments
- GET /api/payment-info - Static payment method details (ACH, check, Zelle, Clover)
- POST /api/quote/:id/create-echeck-session - Create Stripe Checkout session for eCheck/ACH (accepts `{ paymentType: 'deposit' | 'full' }` in request body)
- POST /api/quote/:id/mark-paid - Mark quote as paid (accepts `{ paymentMethod, paymentAmount }`; updates D1, sends customer confirmation email, syncs Airtable "Closed Won")

### Photos (R2)
- POST /api/photos/upload - Upload site photo to R2 (JPEG, PNG, HEIC; max 5MB)
- POST /api/photos/delete - Delete site photo from R2
- GET /r2/quotes/* - Serve photo from R2

### Entities (Contacts, Properties, Openings, Line Items)
- POST /api/contacts - Create/update contact
- GET /api/contacts/:id - Get contact by ID
- POST /api/properties - Create/update property
- GET /api/properties?contact_id=X - List properties for a contact
- POST /api/openings - Create/update opening
- PATCH /api/openings/:id - Partial update opening (auto-save)
- GET /api/openings?property_id=X&quote_id=X - List openings
- POST /api/quote-line-items - Create/update line item
- PATCH /api/quote-line-items/:id - Partial update line item
- PATCH /api/quote-line-items/:id/exclude - Toggle exclude on line item
- GET /api/quote-line-items?quote_id=X - List line items for a quote

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
| `cloudflare-worker.js` | `handleSubmitRemoteSignature()` | Roll-A-Shield | Signature confirmation to sales rep + customer confirmation with payment link |
| `email-templates.js` | `buildEmailPayload()` | Roll-A-Shield Quotes | Quote email (called by app.js) |
| `finalize.html` | inline `generateProductionEmail()` | Roll-A-Shield Production | Production order email (CC: ap@rollashield.com) |
| `cloudflare-worker.js` | `sendPaymentConfirmationEmail()` | Roll-A-Shield | Customer order confirmation on payment close-out |

## Pages & Flows
- `index.html` — Quote builder (sales rep tool)
  - **Two-phase screen entry workflow:**
    - **Phase 1 "Document Opening"**: Name, dimensions, installation/wiring, photos — captured on-site walking each opening
    - **Phase 2 "Configure Screens"**: Track type, operator/motor, fabric, frame color, accessories — applied in batch to selected openings after all are measured
    - Opening cards (amber/dashed) vs configured cards (blue/solid) with status bar
    - Batch configuration: select multiple openings → apply same config to all at once
    - Single-pass still supported: if all fields filled, "Add to Order" creates configured screen directly
    - Draft save: save after Phase 1 only (`orderTotalPrice: 0`), load later to finish configuration
    - `calculateOrderQuote()` blocks if any screens have `phase: 'opening'` (excludes excluded screens from this check)
  - **Screen object states**: `phase: 'opening'` (Phase 1 only, no pricing) or `phase: 'configured'` (full pricing)
  - **Key functions**: `addOpening()`, `applyConfiguration()`, `computeScreenPricing()` (pure, no DOM), `saveDraft()`, `renderInlineEditor()`, `saveInlineEdit()`, `calculateScreenWithAlternateTrack()`, `autoSaveQuote()`, `refreshEmailHistory()`
  - **Shared helper functions**: `getTrackTypeOptions()`, `getTrackTypeName()`, `getOperatorOptionsForTrack()`, `getOperatorTypeName()`, `getFabricOptions()`, `getFabricName()`, `getFrameColorOptions()`, `getFrameColorName()`, `escapeAttr()`, `buildSelectOptionsHtml()` — used across quick config, inline editor, and comparison
  - **Quote ID persistence**: `currentQuoteId` global tracks the active quote's DB ID across recalculate/re-save cycles. Set on `loadQuote()`, reused by `calculateOrderQuote()`, `saveDraft()`, `saveQuote()`. Cleared by `resetForm()`. Prevents duplicate DB rows when editing existing quotes.
  - **Quote number stability**: Worker preserves the existing `quote_number` on re-save (only generates new numbers for brand-new quotes). Also preserves `created_at` timestamp on re-save.
  - **Quick config (per-opening preferences)**: Collapsible "Quick Config" panel in Phase 1. Sets per-opening preferences for track, operator, fabric, frame color. Preferences applied during `applyConfiguration()`. Displayed on opening cards.
  - **Inline card editing**: Configured screens edited in-place via `renderInlineEditor()`. Fields: track, operator, fabric, frame, accessories (dimensions read-only, "Re-measure" link). `editingScreenIndex` global tracks which card is open. `saveInlineEdit()` calls `computeScreenPricing()` and preserves entity IDs + excluded state.
  - **Exclude/include toggle**: `screen.excluded` boolean on configured screens. Excluded screens shown with `.excluded` CSS (faded, dashed border). Excluded screens skipped in pricing calculations and PDF output. `toggleExclude(index)` function.
  - **Pricing comparison**: Two modes — motor comparison (existing) and track type comparison (new). Radio toggle switches between them. Track comparison calls `calculateScreenWithAlternateTrack()` which returns null for dimension-incompatible screens (shown as N/A with warning). Both modes show side-by-side pricing in summary and PDF.
  - Airtable opportunity search & auto-fill customer info
  - Sales rep selection (synced from Airtable)
  - Screen-level accessories (per screen, in Phase 2)
  - Project-level accessories (per order, with quantities)
  - Site photo upload (stored in R2, captured in Phase 1)
  - **4-Week Install Guarantee**: Standalone section between Phase 1 buttons and Phase 2. Hidden when no screens exist. Restricts to Gaposa motors, solar priced at RTS rate.
  - **Configure Screens override**: Phase 2 opening selector shows ALL screens (configured + unconfigured). Unconfigured checked by default (amber), configured unchecked (blue, with config summary). Allows re-configuring already-configured screens while preserving entity IDs and excluded state.
  - **Auto-save on calculate**: `calculateOrderQuote()` automatically calls `autoSaveQuote()` after computing pricing. Shows brief "Auto-saved" indicator. No separate Save Quote button.
  - **Inline email history**: `refreshEmailHistory()` fetches and displays sent email records inline in quote summary when `currentQuoteId` exists. Color-coded type labels (quote/signature/payment/production). Send button shows green checkmark when quote already sent/signed.
  - Dimension validation with dropdown disabling (max widths: Zipper 24', Cable 22', Keder 20'). `updateDropdownCompatibility()` disables track options in all dropdowns when dimensions exceed limits.
  - Max width help text shown below dimension inputs
  - New-screen UX: auto-scroll to last card + 1.5s highlight animation on add. Dynamic Phase 1 header ("Adding Opening #N").
  - PDF generation via html2pdf.js + pdf-template.js
  - Combined "Send Quote + Send for Signature" action
  - Duplicate/edit/remove screens
  - **Fabric options**: 12 total organized in optgroups — Standard (6), 90% (2), 97% (3), Specialty (1: Tuffscreen/Bugscreen)
  - **Quote list status badges**: Color-coded badges on saved quote cards — DRAFT (orange), SENT (blue), SIGNED (green), PAID (purple). Based on `quote_status` and `payment_status` D1 columns.
  - **Sent emails viewer**: "Emails" button on each quote card opens modal showing all sent emails (type, recipients, subject, date). Email records stored in `sent_emails_json` column. `viewSentEmails()` / `showEmailsModal()` functions.
- `sign.html` — Customer signature page (in-person via `?quoteId=&mode=in-person`, remote via `?token=`)
  - Renders quote PDF template inline for review
  - Uses `signature_pad` v4.2.0 for signature capture
  - Shows deposit amount (50%) and payment terms
  - **Remote signing auto-redirect**: After remote signature submission, 3-second countdown then auto-redirect to payment page with `fromSignature=1` param
- `pay.html` — Payment page with deposit/full toggle
  - Toggle between 50% deposit and full payment amount
  - Multi-method: Clover CC, Stripe eCheck, ACH, Zelle (with QR code), check
  - Stripe eCheck sessions dynamically priced based on deposit/full selection
  - **Signature success banner**: Green "Thank you" banner shown when arriving from remote signing (`fromSignature=1` URL param)
- `finalize.html` — Final measurements and production order form
  - **Project info panel**: Full customer info, address, per-screen config summaries (track/operator/fabric/frame/accessories), project accessories, pricing totals, warranty badge
  - Screen selection cards show screen name, track/operator/dimensions, photo count badge, measurement status
  - Opening measurements (width top/middle/bottom, height left/middle/right)
  - Sunair ordering measurements: +5" width for tracks (zipper only, NOT cable), +7.25" height (wall mount) or +5.25" (ceiling mount)
  - "Tracks recess mounted" option hidden for cable screens (`trackType !== 'sunair-cable'`)
  - Cable screens: bracket mount dropdown (floor/wall), magnetic locks checkbox
  - Track additions in production email only for `sunair-zipper` (not cable)
  - Fenetex alert: measurements are opening-only, Production adds track/headbox dims
  - Site photos displayed read-only per screen; installation photos uploadable (up to 5 per screen)
  - Difficult Install checkbox (flags production email with red banner + subject line prefix)
  - Production comments textarea
  - **Production email**: Includes pricing breakdown (materials, installation, wiring, accessories, discounts, total, deposit) and payment info (method, amount, type, date) when payment recorded. Sent to derek@rollashield.com, CC ap@rollashield.com.
  - **Save Measurements button**: Manual save of all measurements and production data (secondary/gray button)
  - **Auto-save on email send**: Calls `saveMeasurements()` before sending production email
  - **Payment close-out with deposit/full toggle**: Radio toggle for deposit (50%) or full amount. Payment method dropdown (credit card, eCheck, ACH, Zelle, check, cash, financing). Combined "Mark as Paid & Send Production Order" button that: (1) records payment via `POST /api/quote/:id/mark-paid`, (2) sends production email with payment details. Two-step execution with partial failure handling. Shows green "Payment Received" badge with method/amount/date details when already paid. `updatePaymentAmountDisplay()` and `updateCombinedButtonState()` manage UI state.

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

### Entity Architecture (contacts, properties, openings, line items)
First-class D1 tables for contacts, properties, openings, and quote line items. The JSON blob in `quotes.quote_data` remains the source of truth; entity tables are synced on every save.

- **Schema**: `d1-schema.sql` (full), `d1-migration-001-entities.sql` (migration for existing DBs)
- **Lazy migration**: When `GET /api/quote/:id` loads a quote with `entities_migrated = 0`, automatically extracts entities from the JSON blob
- **Entity sync on save**: `POST /api/save-quote` syncs contact, property, openings, and line items after saving the blob
- **Entity ID flow**: Frontend stores `_contactId`, `_propertyId` as globals and `_openingId`, `_lineItemId` on screen objects. Passed back to worker on save to reuse existing entity IDs (stable IDs across saves).
- **Orphan cleanup**: When screens are removed, `syncQuoteEntities()` deletes orphaned openings and line items
- **Tables**: `contacts`, `properties`, `openings`, `quote_line_items` — see `d1-schema.sql` for full column list
- **Architecture doc**: `../docs/architecture/properties-and-openings.md`

### Auto-Save & Cross-Device
Individual opening data auto-saves to D1 on field blur, enabling cross-device workflows (start on phone, continue on tablet).

- **Quote builder (app.js)**:
  - `autoSaveOpening(screenIndex)` — PATCHes existing openings (via `_openingId`) or POSTs new ones. Only fires when `currentQuoteId` exists and dimensions are non-zero.
  - `debouncedAutoSaveOpening(screenIndex)` — 1.5s debounce wrapper
  - `syncPhase1FormToScreen()` — reads Phase 1 form values into the in-memory screen object before auto-save
  - Blur handlers on: screenName, widthInches, widthFraction, heightInches, heightFraction, wiringDistance
  - Change handler on: includeInstallation checkbox
  - Photo upload auto-save: after `handlePhotoSelect()`, syncs pending photos to screen and triggers auto-save. `autoSaveOpening()` uploads pending photos to R2 before PATCH.
  - `addOpening()` triggers auto-save after pushing screen to `screensInOrder`
  - Visual "Auto-saved" indicator shown briefly near Save Draft button
  - `autoSaveQuote()` — full quote auto-save triggered after `calculateOrderQuote()`. Calls `saveQuote()` silently, shows brief indicator. No manual Save Quote button needed.
- **Finalize page (finalize.html)**:
  - `autoSaveCurrentMeasurements()` — gathers current measurement form values (partial, no validation) and calls `saveMeasurements()` to persist to D1
  - `debouncedAutoSaveMeasurements()` — 2s debounce wrapper
  - Blur handlers on all measurement inputs (whole + fraction), comments
  - Change handlers on all selects (operator side, mount, brush, surface, crank, cord exit) and checkboxes (installation flags)
  - Conditional fields (gear/motor/cable/solar-specific) included in auto-save
- **Cross-device**: No extra code — entity auto-save + PATCH endpoints enable it. Start quote on one device, save, continue on another.

### Email Tracking
All sent emails are recorded in the `sent_emails_json` column on the `quotes` table.
- `storeEmailRecord(env, quoteId, { type, to, cc, subject, resendId })` — appends record to JSON array
- Email types: `quote`, `signature-request`, `signature-customer-confirmation`, `payment-confirmation`, `production`
- Records stored by: `handleSendEmail` (when `quoteId` provided), `handleSendForSignature`, `handleSubmitRemoteSignature` (customer confirmation), `sendPaymentConfirmationEmail`
- Frontend viewer: `viewSentEmails(quoteId)` → `GET /api/quote/:id/emails` → modal (also inline in quote summary via `refreshEmailHistory()`)

### Airtable Close-Out
On payment close-out (`handleMarkPaid`):
- Opportunity status → "Closed Won" (via `syncAirtableCloseOut`)
- Quote status → "Accepted" with updated total amount
- **Not yet implemented** (needs Airtable field IDs): Sales Amount, Materials Amount, Product Tags, Expected/Sale Date, Final Quote Number, Signed Contract PDF, Project Images

On signature submit (`handleSignInPerson`, `handleSubmitRemoteSignature`):
- Quote status → "Accepted"

### Future plans (not yet implemented)
- **Signed contract PDF for Airtable**: Generate full signed PDF (quote + signature overlay), upload to R2, attach URL to Airtable. Requires server-side PDF generation or client-side generation at signing time.
- **Extended Airtable close-out fields**: Sales Amount, Materials Amount, Product Tags, Expected/Sale Date, Final Quote Number, Project Images — need Airtable field IDs from the Opportunities table schema.
- **Offline functionality**: IndexedDB auto-save, recovery on reload, queued cloud sync. Plan: `.claude/plans/synthetic-baking-pine.md` (includes pros/cons analysis)

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
Schema in `d1-schema.sql`. Five tables: `quotes`, `contacts`, `properties`, `openings`, `quote_line_items`.
- **Signing**: `quote_status`, `signing_token`, `signature_data`, `signed_at`, `signer_name`, `signer_ip`, `signing_method`
- **Payment**: `payment_status` (default 'unpaid'), `payment_method`, `payment_amount`, `payment_date`, `clover_payment_link`, `stripe_payment_intent_id`, `clover_checkout_id`
- **Guarantee**: `four_week_guarantee`, `total_guarantee_discount`
- **Entity references on quotes**: `contact_id`, `property_id`, `entities_migrated`, `sent_emails_json`
- **Photos**: Stored in R2 (key format: `quotes/{quoteId}/screens/{screenIndex}/{timestamp}-{randomId}.{ext}`)

## Important Notes
- This is a vanilla JS project. Do NOT suggest adding npm, webpack, React, or any framework.
- All pricing logic is in `pricing-data.js`. If pricing changes, update ONLY that file.
- The D1 database ID is in `wrangler.toml`. This is a Cloudflare resource identifier, not a secret.
- Motor pricing: `gaposa-rts` $225, `gaposa-solar` $425, `somfy-rts` $375. Customer markup: 1.8x.
- Fabric pricing: Sunair screen base cost is multiplied by fabric type (Nano 95 baseline 1.0x, 90% 0.9636x, 97% Twill 1.1261x, Tuffscreen 0.8112x). Multiplier applied before Sunair discount. Fenetex unaffected. See `FABRIC_PRICE_MULTIPLIERS` in `pricing-data.js`.
- 4-Week Install Guarantee: solar motors priced at RTS rate → saves ($425-$225) × 1.8 = $360/screen. Somfy excluded.
