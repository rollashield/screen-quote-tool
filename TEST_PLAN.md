# Roll-A-Shield Screen Quote Tool - Test Plan

## Test Date: February 10, 2026
## App URL: https://rollashield.github.io/screen-quote-tool/

---

## 1. CUSTOMER INFORMATION TESTS

### Test 1.1: Basic Customer Info Entry
**Steps:**
1. Enter customer name: "Test Customer"
2. Enter email: "test@example.com"
3. Enter phone: "555-1234"
4. Enter address: "123 Test St"

**Expected:** All fields accept input and display correctly
**Status:** ⏳ PENDING

### Test 1.2: Required Field Validation
**Steps:**
1. Leave customer name blank
2. Try to save quote

**Expected:** Error message: "Please enter a customer name"
**Status:** ⏳ PENDING

---

## 2. SCREEN CONFIGURATION TESTS

### Test 2.1: Track Type Selection - Sunair Zipper
**Steps:**
1. Select "Sunair Zipper Track"
2. Verify operator options populate

**Expected:** Should show: Gear, Gaposa RTS, Gaposa Solar, Somfy RTS
**Status:** ⏳ PENDING

### Test 2.2: Track Type Selection - Sunair Cable
**Steps:**
1. Select "Sunair Cable"
2. Check cable surcharge info displays

**Expected:** Cable surcharge message visible, no "No Tracks" option
**Status:** ⏳ PENDING

### Test 2.3: Track Type Selection - Fenetex Keder
**Steps:**
1. Select "Fenetex Keder Track"
2. Check operator options

**Expected:** Only "Gaposa RTS Motor (Included)" option available
**Status:** ⏳ PENDING

### Test 2.4: Fabric Color Selection
**Steps:**
1. Select each fabric color option

**Expected:** All colors selectable from dropdown
**Status:** ⏳ PENDING

---

## 3. DIMENSION INPUT TESTS

### Test 3.1: Width Input - Whole Numbers
**Steps:**
1. Enter width: 120 inches
2. Verify conversion to feet

**Expected:** Should show "10.00 ft" in pricing dimensions
**Status:** ⏳ PENDING

### Test 3.2: Width Input - Fractions
**Steps:**
1. Enter width: 120 inches + 1/2 fraction
2. Verify conversion

**Expected:** Should show "10.04 ft" (rounded up to nearest foot for pricing)
**Status:** ⏳ PENDING

### Test 3.3: Height Input - Whole Numbers
**Steps:**
1. Enter height: 96 inches
2. Verify conversion

**Expected:** Should show "8.00 ft" in pricing dimensions
**Status:** ⏳ PENDING

### Test 3.4: Height Input - Fractions
**Steps:**
1. Enter height: 96 inches + 3/4 fraction
2. Verify conversion

**Expected:** Should show "8.06 ft" (rounded up)
**Status:** ⏳ PENDING

### Test 3.5: Invalid Dimension Input
**Steps:**
1. Try negative numbers
2. Try non-numeric input

**Expected:** Should reject or handle gracefully
**Status:** ⏳ PENDING

---

## 4. PRICING CALCULATION TESTS

### Test 4.1: Basic Sunair Zipper Gear Quote
**Steps:**
1. Track: Sunair Zipper
2. Operator: Gear
3. Dimensions: 10' W x 8' H
4. Fabric: Charcoal 95%
5. Include installation: Yes
6. Calculate quote

**Expected:** Should calculate base cost + installation, show customer price
**Status:** ⏳ PENDING

### Test 4.2: Sunair Zipper with RTS Motor
**Steps:**
1. Track: Sunair Zipper
2. Operator: Gaposa RTS
3. Dimensions: 10' W x 8' H
4. Calculate quote

**Expected:** Should include motor cost separately in internal breakdown
**Status:** ⏳ PENDING

### Test 4.3: Sunair Cable with Surcharge
**Steps:**
1. Track: Sunair Cable
2. Operator: Gear
3. Dimensions: 10' W x 8' H
4. Calculate quote

**Expected:** $125 cable surcharge should be added to first cable screen only
**Status:** ⏳ PENDING

### Test 4.4: Fenetex Pricing
**Steps:**
1. Track: Fenetex Keder
2. Operator: Gaposa RTS (auto-selected)
3. Dimensions: 10' W x 8' H
4. Calculate quote

**Expected:** Should use Fenetex pricing matrix with 1.20 markup
**Status:** ⏳ PENDING

### Test 4.5: No Tracks Option
**Steps:**
1. Track: Sunair Zipper
2. Operator: Gear
3. Check "No Tracks" option
4. Calculate quote

**Expected:** Should deduct track cost from total
**Status:** ⏳ PENDING

### Test 4.6: Installation Toggle
**Steps:**
1. Configure screen
2. Uncheck "Include Installation"
3. Calculate quote

**Expected:** Installation cost should be $0
**Status:** ⏳ PENDING

---

## 5. ACCESSORIES TESTS

### Test 5.1: Accessory Selection
**Steps:**
1. Select various accessories
2. Calculate quote

**Expected:** Accessory costs added to total
**Status:** ⏳ PENDING

### Test 5.2: Remote Control Accessories
**Steps:**
1. Select motorized operator
2. Check remote control accessories appear

**Expected:** Remote options visible for motorized screens only
**Status:** ⏳ PENDING

---

## 6. DISCOUNT TESTS

### Test 6.1: Apply Percentage Discount
**Steps:**
1. Calculate quote
2. Enter discount: 10%
3. Enter label: "Spring Sale"
4. Recalculate

**Expected:** 10% discount applied to materials (not installation)
**Status:** ⏳ PENDING

### Test 6.2: Zero Discount
**Steps:**
1. Leave discount at 0%
2. Calculate quote

**Expected:** No discount line shown
**Status:** ⏳ PENDING

---

## 7. MULTI-SCREEN ORDER TESTS

### Test 7.1: Add Multiple Screens
**Steps:**
1. Configure first screen
2. Click "Add to Order"
3. Configure second screen (different size)
4. Click "Add to Order"
5. Calculate Order Quote

**Expected:** Both screens listed, totals calculated correctly
**Status:** ⏳ PENDING

### Test 7.2: Edit Screen in Order
**Steps:**
1. Add screen to order
2. Click "Edit" on screen card
3. Modify dimensions
4. Update

**Expected:** Screen updates in order list
**Status:** ⏳ PENDING

### Test 7.3: Duplicate Screen
**Steps:**
1. Add screen to order
2. Click "Duplicate"

**Expected:** Identical screen added to order
**Status:** ⏳ PENDING

### Test 7.4: Remove Screen from Order
**Steps:**
1. Add screen to order
2. Click "Remove"
3. Confirm

**Expected:** Screen removed from order
**Status:** ⏳ PENDING

### Test 7.5: Cable Surcharge - Multiple Cables
**Steps:**
1. Add 3 Sunair Cable screens to order
2. Calculate Order Quote

**Expected:** $125 surcharge applied ONCE to total (not per screen)
**Status:** ⏳ PENDING

---

## 8. COMPARISON FEATURE TESTS

### Test 8.1: Enable Motor Comparison
**Steps:**
1. Add motorized screen to order
2. Enable comparison
3. Select alternative motor
4. Calculate Order Quote

**Expected:** Two-column pricing shown (original vs comparison)
**Status:** ⏳ PENDING

### Test 8.2: Comparison with Multiple Screens
**Steps:**
1. Add 3 motorized screens
2. Enable comparison
3. Select Somfy RTS as comparison motor
4. Calculate

**Expected:** All screens recalculated with comparison motor
**Status:** ⏳ PENDING

---

## 9. PHOTO UPLOAD TESTS

### Test 9.1: Upload Single Photo
**Steps:**
1. Click "📷 Add Photos"
2. Select image file
3. Verify thumbnail appears

**Expected:** Photo thumbnail displayed with remove button
**Status:** ⏳ PENDING

### Test 9.2: Upload Multiple Photos
**Steps:**
1. Click "📷 Add Photos"
2. Select 3 images
3. Verify all appear

**Expected:** All 3 thumbnails displayed in grid
**Status:** ⏳ PENDING

### Test 9.3: Remove Photo
**Steps:**
1. Upload photo
2. Click × button on thumbnail

**Expected:** Photo removed from preview
**Status:** ⏳ PENDING

### Test 9.4: Click to View Full Size
**Steps:**
1. Upload photo
2. Click thumbnail

**Expected:** Modal opens with full-size image
**Status:** ⏳ PENDING

### Test 9.5: Photo Compression
**Steps:**
1. Upload large image (5MB+)
2. Check file size in browser

**Expected:** Image compressed to ~200-400KB
**Status:** ⏳ PENDING

---

## 10. SCREEN VISUALIZATION TESTS

### Test 10.1: Open Visualization Tool
**Steps:**
1. Click "✨ Visualize Screen with AI"

**Expected:** Modal opens with photo upload option
**Status:** ⏳ PENDING

### Test 10.2: Load Photo to Canvas
**Steps:**
1. Upload photo in visualization tool
2. Check canvas displays

**Expected:** Photo loads on canvas with 4 draggable corner points
**Status:** ⏳ PENDING

### Test 10.3: Drag Corner Points
**Steps:**
1. Load photo
2. Drag each blue corner point
3. Verify overlay updates

**Expected:** Screen overlay moves with corner positions
**Status:** ⏳ PENDING

### Test 10.4: Adjust Opacity
**Steps:**
1. Load photo with overlay
2. Move opacity slider

**Expected:** Screen transparency changes, percentage updates
**Status:** ⏳ PENDING

### Test 10.5: Toggle Housing Box
**Steps:**
1. Load photo
2. Uncheck "Show Housing Box"
3. Check again

**Expected:** Housing box appears/disappears at top of screen
**Status:** ⏳ PENDING

### Test 10.6: Save Visualization
**Steps:**
1. Create visualization
2. Click "💾 Save Visualization to Quote"

**Expected:** Visualization added to photo preview, modal closes
**Status:** ⏳ PENDING

---

## 11. SAVE & LOAD QUOTE TESTS

### Test 11.1: Save Quote Locally (Offline)
**Steps:**
1. Create complete quote
2. Click "Save Quote"

**Expected:** Success message, quote appears in saved quotes list with 💾 icon
**Status:** ⏳ PENDING

### Test 11.2: Load Saved Quote
**Steps:**
1. Save quote
2. Click on saved quote card

**Expected:** All fields repopulate with saved data
**Status:** ⏳ PENDING

### Test 11.3: Save Quote with Photos
**Steps:**
1. Create quote with 2 photos
2. Save
3. Reload
4. Check photos

**Expected:** Photos load correctly, count shown in saved quote card
**Status:** ⏳ PENDING

---

## 12. MICROSOFT AUTHENTICATION TESTS

### Test 12.1: Sign In
**Steps:**
1. Click "🔐 Sign In with Microsoft"
2. Enter Microsoft 365 credentials
3. Approve permissions

**Expected:** User name displayed, sync status shows "Cloud Synced"
**Status:** ⏳ PENDING (requires admin approval)

### Test 12.2: Save Quote to Cloud
**Steps:**
1. Sign in
2. Create quote
3. Save

**Expected:** Quote syncs to SharePoint, cloud icon shown
**Status:** ⏳ PENDING (requires admin approval)

### Test 12.3: Load Cloud Quote
**Steps:**
1. Sign in
2. Click cloud quote (☁️)

**Expected:** Quote loads from SharePoint
**Status:** ⏳ PENDING (requires admin approval)

### Test 12.4: Sign Out
**Steps:**
1. Sign in
2. Click "Sign Out"

**Expected:** Returns to signed-out state, offline mode
**Status:** ⏳ PENDING (requires admin approval)

---

## 13. PDF EXPORT TESTS

### Test 13.1: Generate PDF
**Steps:**
1. Calculate quote
2. Click "Download PDF"

**Expected:** Print dialog opens with quote details
**Status:** ⏳ PENDING

### Test 13.2: PDF with Photos
**Steps:**
1. Create quote with photos
2. Generate PDF

**Expected:** Photos included in PDF output
**Status:** ⏳ PENDING

### Test 13.3: Internal Info Hidden in PDF
**Steps:**
1. Generate PDF
2. Check for cost breakdown

**Expected:** Internal costs, margins NOT visible in PDF
**Status:** ⏳ PENDING

---

## 14. EMAIL QUOTE TESTS

### Test 14.1: Email Quote
**Steps:**
1. Enter customer email
2. Calculate quote
3. Click "Email Quote"

**Expected:** Email client opens with pre-filled subject, body
**Status:** ⏳ PENDING

### Test 14.2: Email Without Customer Email
**Steps:**
1. Leave email blank
2. Try to email quote

**Expected:** Error: "Please enter a customer email address"
**Status:** ⏳ PENDING

---

## 15. FORM RESET TESTS

### Test 15.1: Clear Form
**Steps:**
1. Fill out all fields
2. Click "Clear Form"
3. Confirm

**Expected:** All fields reset to defaults, photos cleared
**Status:** ⏳ PENDING

### Test 15.2: Cancel Clear Form
**Steps:**
1. Fill out fields
2. Click "Clear Form"
3. Click "Cancel" in confirmation

**Expected:** Form data retained
**Status:** ⏳ PENDING

---

## 16. RESPONSIVE DESIGN TESTS

### Test 16.1: Mobile View (Portrait)
**Steps:**
1. Resize browser to 375px width
2. Test all features

**Expected:** Layout adapts, all features accessible
**Status:** ⏳ PENDING

### Test 16.2: Tablet View
**Steps:**
1. Resize to 768px width
2. Test navigation

**Expected:** Layout responsive, readable
**Status:** ⏳ PENDING

### Test 16.3: Desktop View
**Steps:**
1. Full screen (1920px)
2. Check layout

**Expected:** Content centered, max-width applied
**Status:** ⏳ PENDING

---

## 17. SETTINGS TESTS

### Test 17.1: Open Settings
**Steps:**
1. Click "⚙️ Settings"

**Expected:** Settings modal opens
**Status:** ⏳ PENDING

### Test 17.2: View Settings Info
**Steps:**
1. Open settings
2. Read info

**Expected:** Shows AI visualization status, cost info
**Status:** ⏳ PENDING

---

## 18. EDGE CASE TESTS

### Test 18.1: Very Large Dimensions
**Steps:**
1. Enter width: 24 ft
2. Enter height: 16 ft
3. Calculate

**Expected:** Handles large dimensions, checks if pricing data exists
**Status:** ⏳ PENDING

### Test 18.2: Very Small Dimensions
**Steps:**
1. Enter width: 3 ft
2. Enter height: 4 ft
3. Calculate

**Expected:** Uses minimum pricing values
**Status:** ⏳ PENDING

### Test 18.3: Special Characters in Text Fields
**Steps:**
1. Enter customer name: "O'Brien & Sons"
2. Save quote

**Expected:** Handles apostrophes, ampersands correctly
**Status:** ⏳ PENDING

### Test 18.4: Empty Quote Save
**Steps:**
1. Fresh page
2. Try to save without calculating

**Expected:** Error: "Please calculate a quote first"
**Status:** ⏳ PENDING

---

## 19. BROWSER COMPATIBILITY TESTS

### Test 19.1: Chrome
**Expected:** Full functionality
**Status:** ⏳ PENDING

### Test 19.2: Firefox
**Expected:** Full functionality
**Status:** ⏳ PENDING

### Test 19.3: Safari
**Expected:** Full functionality
**Status:** ⏳ PENDING

### Test 19.4: Edge
**Expected:** Full functionality
**Status:** ⏳ PENDING

### Test 19.5: Mobile Safari (iOS)
**Expected:** Full functionality, camera integration works
**Status:** ⏳ PENDING

### Test 19.6: Mobile Chrome (Android)
**Expected:** Full functionality, camera integration works
**Status:** ⏳ PENDING

---

## 20. PERFORMANCE TESTS

### Test 20.1: Load Time
**Steps:**
1. Open app in new browser
2. Measure time to interactive

**Expected:** < 3 seconds
**Status:** ⏳ PENDING

### Test 20.2: Quote Calculation Speed
**Steps:**
1. Configure complex order (5 screens)
2. Measure calculation time

**Expected:** < 1 second
**Status:** ⏳ PENDING

### Test 20.3: Photo Upload Performance
**Steps:**
1. Upload 10 photos simultaneously

**Expected:** All process without freezing UI
**Status:** ⏳ PENDING

---

## TEST SUMMARY

**Total Tests:** 95
**Passed:** 0
**Failed:** 0
**Pending:** 95
**Blocked:** 0

## NOTES
- Tests marked as PENDING require admin approval for Microsoft authentication
- All tests should be run in production environment: https://rollashield.github.io/screen-quote-tool/
- Critical bugs should be fixed immediately
- Non-critical issues can be logged for future updates
