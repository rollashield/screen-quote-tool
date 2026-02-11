# Roll-A-Shield Screen Quote Tool - Smoke Test Results

## Test Date: February 10, 2026
## Test URL: https://rollashield.github.io/screen-quote-tool/
## Tester: [Your Name]

---

## SMOKE TEST CHECKLIST (15 Critical Tests)

### ✅ Test 1: App Loads Without Errors
**Steps:**
1. Open https://rollashield.github.io/screen-quote-tool/
2. Check browser console (F12) for errors
3. Verify page displays completely

**Expected:** No console errors, header shows "Roll-A-Shield Screen Quote Tool"
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 2: Enter Customer Information
**Steps:**
1. Enter Customer Name: "Smoke Test Customer"
2. Enter Email: "test@rollashield.com"
3. Enter Phone: "555-1234"
4. Enter Address: "123 Test Street, Phoenix AZ"

**Expected:** All fields accept input
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 3: Select Track and Operator
**Steps:**
1. Track Type: Select "Sunair Zipper Track"
2. Verify Operator dropdown populates
3. Operator: Select "Gear Operation (Manual)"

**Expected:** Operator options appear after selecting track type
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 4: Enter Screen Dimensions
**Steps:**
1. Width (Inches): 120
2. Height (Inches): 96
3. Verify dimensions summary updates

**Expected:** Shows "10.00 ft W x 8.00 ft H"
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 5: Select Fabric Color
**Steps:**
1. Fabric Color: Select any option (e.g., "Charcoal 95%")

**Expected:** Dropdown works, selection saved
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 6: Calculate Single Screen Quote
**Steps:**
1. Ensure all required fields filled (from tests 2-5)
2. Leave "Include Installation" checked
3. Scroll down to quote summary section
4. Verify quote appears

**Expected:**
- Quote summary appears (not hidden)
- Customer price displayed
- Installation price shown
- Total price calculated
**Status:** ⬜ PASS / ⬜ FAIL
**Actual Price Shown:** $_______________
**Notes:** _______________________________________________

---

### ✅ Test 7: Upload Photo
**Steps:**
1. Click "📷 Add Photos" button
2. Select an image from your computer
3. Verify thumbnail appears

**Expected:** Photo thumbnail displayed with × remove button
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 8: Add Screen to Order
**Steps:**
1. With quote still calculated, click "Add to Order" button
2. Verify screen appears in "Screens in Order" section
3. Check screen details are correct

**Expected:**
- "Screens in Order" section visible
- Screen card shows: name, dimensions, price
- Edit and Remove buttons present
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 9: Calculate Order Quote
**Steps:**
1. Click "Calculate Order Quote" button
2. Verify order summary appears

**Expected:**
- Order summary displays
- Materials subtotal shown
- Installation shown
- Grand total calculated
**Status:** ⬜ PASS / ⬜ FAIL
**Actual Total:** $_______________
**Notes:** _______________________________________________

---

### ✅ Test 10: Apply Discount
**Steps:**
1. In discount section, enter:
   - Discount %: 10
   - Label: "Test Discount"
2. Quote should auto-recalculate
3. Verify discount appears in summary

**Expected:**
- Discount line shows -10%
- Discounted total updates
- Installation not discounted
**Status:** ⬜ PASS / ⬜ FAIL
**Discounted Total:** $_______________
**Notes:** _______________________________________________

---

### ✅ Test 11: Save Quote Locally
**Steps:**
1. Click "Save Quote" button
2. Check for success message
3. Scroll to "Saved Quotes" section
4. Verify quote appears with 💾 icon

**Expected:**
- Alert: "✅ Quote saved locally!"
- Quote card appears in saved quotes
- Shows customer name, date, price
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 12: Load Saved Quote
**Steps:**
1. Click on the saved quote card
2. Verify all fields repopulate
3. Check that screens in order reload
4. Verify photos reload

**Expected:**
- Customer info repopulates
- Screens appear in order section
- Photos appear in preview
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 13: Screen Visualization Tool
**Steps:**
1. Click "✨ Visualize Screen with AI" button
2. Modal should open
3. Click "📷 Take/Select Photo"
4. Upload an image
5. Verify canvas editor appears

**Expected:**
- Modal opens
- After photo upload, canvas displays
- 4 blue corner points visible
- Opacity slider present
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 14: Generate PDF
**Steps:**
1. With quote calculated, click "Download PDF"
2. Verify print dialog opens

**Expected:**
- Browser print dialog appears
- Quote details visible in preview
- Internal costs hidden
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

### ✅ Test 15: Reset Form
**Steps:**
1. Click "Clear Form" button
2. Confirm in dialog
3. Verify all fields clear

**Expected:**
- Confirmation dialog appears
- After confirming, all fields reset
- Photos cleared
- Quote summary hidden
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

## BONUS TESTS (Quick Mobile Check)

### ✅ Bonus Test 16: Mobile Responsive
**Steps:**
1. Resize browser window to ~400px width
2. OR: Open on actual mobile device
3. Verify layout adapts

**Expected:** Layout stacks vertically, remains usable
**Status:** ⬜ PASS / ⬜ FAIL
**Notes:** _______________________________________________

---

## TEST SUMMARY

**Tests Passed:** _____ / 15
**Tests Failed:** _____ / 15
**Critical Failures:** _____

## FAILED TESTS (if any)
List any failed tests here with details:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

## BUGS DISCOVERED
List any bugs found during testing:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

## OVERALL ASSESSMENT
⬜ PASS - App is stable and ready for use
⬜ FAIL - Critical issues found, needs fixes before use
⬜ PARTIAL - Minor issues found, usable but needs improvements

## ADDITIONAL NOTES
_______________________________________________
_______________________________________________
_______________________________________________

---

## SIGN-OFF

**Tested By:** _____________________
**Date:** _____________________
**Signature:** _____________________
