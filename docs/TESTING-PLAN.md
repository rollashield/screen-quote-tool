# Screen Quote Tool — Testing Plan

## Current State
- **84 unit tests** in `tests/test-pricing-engine.js` covering all pure pricing functions
- **0 tests** for: order calculation display, screen card rendering, quote persistence, photo management, Airtable integration, PDF generation, cross-page flows, exclude/include logic
- Run existing tests: `node tests/test-pricing-engine.js`

## Priority 1: Pure Function Tests (Node.js, no DOM)

These can run today with `node`, no framework needed. Extract testable logic from DOM-dependent modules.

### 1A. Order Calculator Logic (`tests/test-order-calculator.js`)
Test the data flow — given a `screensInOrder` array, verify correct totals.

| Test Case | Input | Expected |
|-----------|-------|----------|
| Single screen, no extras | 1 configured screen | Totals match `computeScreenPricing()` output |
| Two screens, one excluded | 2 screens, `screens[1].excluded = true` | Totals only include screen 0 |
| All screens excluded | 2 excluded screens | Alert / block (empty order) |
| Mixed phases, excluded opening | 1 opening (excluded) + 1 configured | Should calculate (opening excluded from phase check) |
| Unconfigured opening blocks calc | 1 opening (not excluded) | `calculateOrderQuote()` returns false |
| Discount applied | 10% discount, $1000 materials | Materials = $900, discount = $100 |
| Cable surcharge | 2 cable screens | Surcharge on first only |
| Project accessories | Bond Bridge x2 | Added to total at customer price |
| 4-week guarantee + solar | Solar screen + guarantee | Solar priced at RTS rate, discount computed |
| 4-week guarantee + RTS | RTS screen + guarantee | Bond Bridge added (1 per project) |
| Comparison totals (motor) | 2 screens, compare gear vs RTS | Separate totals computed correctly |
| Comparison totals (track) | Zipper screens, compare cable | Incompatible screens shown as N/A |

### 1B. Screen State Logic (`tests/test-screen-states.js`)
Test phase transitions, exclude toggle, and data preservation.

| Test Case | Expected |
|-----------|----------|
| New opening has `phase: 'opening'` | Screen object has correct defaults |
| `applyConfiguration()` sets `phase: 'configured'` | Phase changes, pricing fields populated |
| `toggleExclude()` flips `excluded` flag | `screen.excluded` toggled |
| Exclude preserves entity IDs | `_openingId`, `_lineItemId` unchanged |
| Duplicate screen clears entity IDs | New screen has no `_openingId` |
| Duplicate screen deep-copies accessories | Modifying copy doesn't affect original |
| Inline edit preserves `excluded` state | Save inline → `excluded` unchanged |
| Inline edit preserves entity IDs | Save inline → `_openingId` unchanged |
| Backward compat: no `phase` field → `'configured'` | Old quotes load correctly |
| `getApplicableProjectAccessories()` filters by motor | Gaposa motors → Gaposa accessories only |
| Bond Bridge filtered from per-screen accessories | Not in screen-level list |

### 1C. PDF Data Mapping (`tests/test-pdf-mapping.js`)
Test `mapOrderDataToTemplate()` — pure data transformation.

| Test Case | Expected |
|-----------|----------|
| Excluded screens filtered from PDF output | Only non-excluded screens in template |
| Unconfigured screens block PDF | Throws error |
| Address formatting (full) | Street + Apt + City, State Zip |
| Address formatting (partial) | Missing apt/city handled gracefully |
| Comparison labels (motor mode) | Primary + comparison column headers |
| Comparison labels (track mode) | Track names used for headers |
| Deposit calculation | 50% of grand total |
| Guarantee discount shown | Line item in pricing section |
| Project accessories in PDF | Listed with quantities and totals |
| Screen accessories in PDF | Per-screen accessory list |

## Priority 2: Integration Tests (Multi-Module, needs mocking)

These test workflows spanning multiple modules. Require a minimal DOM mock or jsdom.

### 2A. Quote Lifecycle (`tests/test-quote-lifecycle.js`)
Simulate the full create → configure → calculate → save → reload cycle.

| Test Case | Expected |
|-----------|----------|
| Create 3 openings → configure 2 → exclude 1 → calculate | Total reflects 1 configured, non-excluded screen |
| Save quote → reload → verify all screen data intact | Entity IDs, photos, accessories preserved |
| Save draft (unconfigured) → reload → configure → calculate | Draft loads, Phase 2 completes successfully |
| Recalculate after exclude toggle | Totals update, excluded screen not in summary |
| Recalculate after inline edit (change motor) | New motor price reflected in totals |
| Quick config preferences applied during configure | Track/operator/fabric from Phase 1 prefs |
| Quote number preserved on re-save | Same `quote_number` after edit+save |
| `currentQuoteId` set on first save, reused on re-save | No duplicate DB rows |

### 2B. Cross-Page Data Flow (`tests/test-cross-page.js`)
Verify data integrity as quotes flow through index → sign → pay → finalize.

| Test Case | Expected |
|-----------|----------|
| Quote with excluded screen → sign page | Excluded screen not rendered in PDF preview |
| Quote with excluded screen → finalize page | Excluded screen not in screen list or production email |
| Payment method selected on pay.html → finalize dropdown | `selected_payment_method` pre-populates |
| Signature data stored → finalize shows signed status | `signed_at` timestamp visible |
| Mark paid → Airtable close-out | Status = "Closed Won", amounts match |

### 2C. Auto-Save (`tests/test-auto-save.js`)

| Test Case | Expected |
|-----------|----------|
| Blur on width field → auto-save fires after 1.5s | PATCH sent with updated dimensions |
| Rapid field changes → only last save fires | Debounce prevents multiple PATCHes |
| No `currentQuoteId` → auto-save skipped | No API call |
| Zero dimensions → auto-save skipped | No API call |
| Auto-save on calculate → `saveQuote()` called | Quote persisted after pricing |
| Pending photos uploaded before opening PATCH | R2 upload completes first |

## Priority 3: API / Worker Tests

Test Cloudflare Worker endpoints. Can use `wrangler dev` + fetch, or mock D1/R2.

### 3A. Save Quote (`tests/api/test-save-quote.js`)

| Test Case | Expected |
|-----------|----------|
| New quote (no ID) → INSERT | Returns new `id`, `quote_number` generated |
| Existing quote (with ID) → UPDATE | Same `id`, `quote_number` preserved, `created_at` preserved |
| Server-side merge: index.html save doesn't clobber finalize data | Measurement fields from finalize untouched |
| Server-side merge: finalize save doesn't clobber pricing | Pricing fields from index untouched |
| Quote data history snapshot created | `quote_data_history` row with old blob |
| Entity sync: openings created from screens | `openings` table has matching rows |
| Entity sync: orphan cleanup on screen removal | Deleted screen's opening removed |

### 3B. Signing Endpoints

| Test Case | Expected |
|-----------|----------|
| `POST /api/quote/:id/sign` with valid signature | `signature_data`, `signed_at` stored |
| `POST /api/send-for-signature` | `signing_token` generated, email sent |
| `POST /api/quote/:id/submit-remote-signature` with valid token | Signature stored, confirmation emails sent |
| Invalid/expired token | 403 error |
| Draft quote (unconfigured screens) → send for signature | 400 error |

### 3C. Payment Endpoints

| Test Case | Expected |
|-----------|----------|
| `POST /api/quote/:id/create-echeck-session` (deposit) | Stripe session with 50% amount |
| `POST /api/quote/:id/create-echeck-session` (full) | Stripe session with 100% amount |
| `POST /api/quote/:id/create-clover-session` | Clover session with pre-filled customer info |
| `POST /api/quote/:id/select-payment-method` | `selected_payment_method` updated in D1 |
| `POST /api/quote/:id/mark-paid` | Payment fields updated, confirmation email sent, Airtable synced |

### 3D. Photo Endpoints

| Test Case | Expected |
|-----------|----------|
| Upload JPEG < 5MB | R2 key returned, metadata correct |
| Upload > 5MB | 400 error |
| Upload non-image | 400 error |
| Delete existing photo | R2 object removed |
| Serve photo via `GET /r2/quotes/*` | Correct content-type, 200 |

## Priority 4: End-to-End Smoke Tests

Manual or automated (Playwright) tests for the critical happy paths. These catch the bugs that unit tests miss — like the exclude display bug.

### E2E Test Scenarios

#### Scenario 1: Basic Quote (Happy Path)
1. Load index.html
2. Enter customer name, email, phone, address
3. Add 3 openings with different dimensions
4. Configure all 3 with zipper track, RTS motor, Espresso fabric
5. Calculate quote
6. **Verify**: 3 screens in summary, totals correct, all screens listed
7. Download PDF
8. **Verify**: PDF has 3 screens, correct totals

#### Scenario 2: Exclude Screen
1. Create quote with 3 configured screens
2. Calculate quote → note total
3. Exclude screen #2
4. Recalculate
5. **Verify**: Summary shows 2 screens (not 3)
6. **Verify**: Total decreased by screen #2's price
7. **Verify**: PDF shows 2 screens
8. Re-include screen #2
9. Recalculate
10. **Verify**: Back to 3 screens, original total

#### Scenario 3: Mixed Phases + Exclude
1. Add 4 openings
2. Configure openings 1-3, leave opening 4 unconfigured
3. Try to calculate → **Verify**: blocked ("configure all screens")
4. Exclude opening 4
5. Calculate → **Verify**: succeeds with 3 screens
6. **Verify**: Opening 4 not in summary or PDF

#### Scenario 4: Draft Save and Reload
1. Add 2 openings (Phase 1 only, no config)
2. Save Draft
3. Close tab, reopen, load the draft
4. **Verify**: 2 openings restored with names, dimensions, photos
5. Configure both, calculate, save
6. **Verify**: Quote transitions from DRAFT to active

#### Scenario 5: Inline Edit After Calculate
1. Create and calculate a 2-screen quote
2. Click edit on screen 1, change motor from RTS to Solar
3. Save inline edit
4. Recalculate
5. **Verify**: Screen 1 shows solar pricing, total updated

#### Scenario 6: Cross-Page Flow
1. Create quote, calculate, save
2. Send for signature (email)
3. Open sign.html with token
4. **Verify**: PDF renders, excluded screens hidden
5. Sign and submit
6. **Verify**: Redirects to pay.html with success banner
7. Select payment method
8. Open finalize.html
9. **Verify**: Payment method pre-populated in dropdown
10. **Verify**: Excluded screens not shown
11. Enter measurements, mark paid, send production email
12. **Verify**: Production email has correct screens and measurements

#### Scenario 7: 4-Week Guarantee
1. Create 3-screen quote: 1 solar, 1 RTS, 1 gear
2. Enable 4-week guarantee
3. Calculate
4. **Verify**: Solar priced at RTS rate (discount shown)
5. **Verify**: Bond Bridge added as project accessory (1x)
6. **Verify**: Gear screen unaffected
7. Disable guarantee, recalculate
8. **Verify**: Prices revert, Bond Bridge removed

#### Scenario 8: Dimension Limits
1. Enter width of 25 feet
2. **Verify**: Zipper, Cable, and Keder all disabled (all exceeded)
3. Change to 23 feet
4. **Verify**: Zipper enabled, Cable and Keder disabled
5. Change to 21 feet
6. **Verify**: Zipper and Cable enabled, Keder disabled

## Priority 5: Regression Tests for Known Bugs

Add a test for every bug found in production. These prevent regressions.

| Bug | Test | File |
|-----|------|------|
| Excluded screens shown in quote summary | `displayOrderQuoteSummary` skips excluded | `test-order-calculator.js` |
| Excluded screens shown on finalize page | `renderProjectInfo`, `displayScreenList`, `generateProductionEmail` skip excluded | `test-cross-page.js` |
| INSERT OR REPLACE clobbers columns | Save uses UPDATE for existing quotes | `test-save-quote.js` |
| `html2canvas` blank with `left: -9999px` | (Legacy, now using pdfmake) | N/A |
| Comparison column showing with no motor selected | Guard on `comparisonMotor` truthiness | `test-order-calculator.js` |
| Wiring fields lost through recalculate | `wiringDistance` preserved in screen object | `test-screen-states.js` |
| Measurements lost when saving from index.html | Server-side merge preserves finalize fields | `test-save-quote.js` |

## Implementation Order

### Phase 1 — Quick wins (1-2 sessions)
1. `tests/test-order-calculator.js` — Extract calculation logic tests (Priority 1A)
2. `tests/test-screen-states.js` — Screen state machine tests (Priority 1B)
3. `tests/test-pdf-mapping.js` — PDF data mapping tests (Priority 1C)
4. Add regression tests for every known bug (Priority 5)

### Phase 2 — Integration coverage (2-3 sessions)
5. `tests/test-quote-lifecycle.js` — Multi-module workflow tests (Priority 2A)
6. `tests/test-auto-save.js` — Debounce and persistence tests (Priority 2C)

### Phase 3 — API tests (2-3 sessions)
7. Worker endpoint tests using `wrangler dev` or mocked D1 (Priority 3)

### Phase 4 — E2E smoke tests (ongoing)
8. Manual checklist for pre-deploy verification (Priority 4)
9. Optional: Playwright automation for critical paths

## Test Infrastructure

### Current approach (keep it simple)
- Node.js `assert` module — no npm, no framework
- Each test file: `node tests/test-<name>.js`
- `module.exports` pattern on all modules for Node.js testability
- Mock globals (`screensInOrder`, `currentQuoteId`, etc.) at test file top

### Example test pattern
```javascript
// tests/test-order-calculator.js
const assert = require('assert');

// Mock globals that order-calculator.js expects
global.screensInOrder = [];
global.currentQuoteId = null;
global.projectAccessories = [];
global.document = { getElementById: () => ({ value: '', checked: false, selectedOptions: [{}] }) };

// Load dependencies
const { computeScreenPricing, formatCurrency } = require('../pricing-engine');
// ... load order-calculator after mocking

// Test: excluded screens not counted
function testExcludedScreenCount() {
    const screens = [
        { excluded: false, phase: 'configured', customerPrice: 1000 },
        { excluded: true, phase: 'configured', customerPrice: 500 },
        { excluded: false, phase: 'configured', customerPrice: 800 }
    ];
    const included = screens.filter(s => !s.excluded);
    assert.strictEqual(included.length, 2, 'Should count 2 non-excluded screens');
}
```

### For DOM-dependent tests (Phase 2+)
Options (pick one when ready):
- **jsdom** via npm: lightweight DOM mock, good for unit-ish tests
- **Playwright**: real browser, best for E2E smoke tests
- **Manual checklist**: printed/digital checklist for pre-deploy verification (zero setup)

## Pre-Deploy Checklist (Use Now)

Before every deploy, manually verify:

- [ ] Add 2+ openings, configure, calculate — totals correct
- [ ] Exclude a screen, recalculate — screen disappears from summary
- [ ] Re-include, recalculate — screen reappears
- [ ] Save quote, reload page, load quote — all data intact
- [ ] Download PDF — correct screens, correct totals
- [ ] Open finalize page — excluded screens not shown
- [ ] Inline edit a screen, recalculate — price updates
- [ ] Run `node tests/test-pricing-engine.js` — 84/84 pass
