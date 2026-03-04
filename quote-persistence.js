/**
 * quote-persistence.js
 * Save, load, delete quotes + auto-save + email history.
 *
 * Dependencies:
 *   - pricing-engine.js (provides formatCurrency, getTrackTypeName, etc.)
 *   - photo-manager.js (provides uploadPendingPhotos, deleteMarkedPhotos)
 *   - screen-cards.js (provides renderScreensList)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - currentQuoteId, currentContactId, currentPropertyId: Entity tracking
 *   - isSaving: Save lock flag
 *   - screensInOrder: Array of screen objects
 *   - editingScreenIndex: Index of screen being edited
 *   - existingScreenPhotos, pendingScreenPhotos: Photo arrays
 *   - WORKER_URL: Worker base URL (from index.html)
 *   - window.currentOrderData: Calculated order data
 *
 * Extracted from app.js in Step 2 refactoring.
 */

// ─── Auto-Save (individual opening PATCH/POST) ──────────────────────────────
var autoSaveTimers = {}; // Per-screen debounce timers, keyed by screen index
var AUTO_SAVE_DEBOUNCE_MS = 1500;

/**
 * Auto-save a single opening to D1 via PATCH (update) or POST (create).
 * Only fires when currentQuoteId exists and the opening has valid dimensions.
 * Also uploads any pending photos to R2 and patches the opening's photos array.
 * Silent — no alerts or UI disruption on success. Logs errors to console.
 */
async function autoSaveOpening(screenIndex) {
    if (!currentQuoteId) return;
    const screen = screensInOrder[screenIndex];
    if (!screen) return;

    // Only auto-save openings with non-zero width AND height
    if (!screen.totalWidthInches || !screen.totalHeightInches) return;

    // Upload pending photos first (if any) so they're included in the save
    if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
        try {
            const uploaded = await uploadPendingPhotos(String(currentQuoteId), screenIndex, screen.pendingPhotos);
            screen.photos = (screen.photos || []).concat(uploaded);
            screen.pendingPhotos = [];
            // Update photo globals and preview if this screen is currently being edited
            if (editingScreenIndex === screenIndex) {
                existingScreenPhotos = screen.photos.slice();
                pendingScreenPhotos = [];
                renderPhotoPreview();
            }
        } catch (err) {
            console.error('Auto-save photo upload failed:', err);
        }
    }

    const openingData = {
        quoteId: String(currentQuoteId),
        name: screen.screenName || null,
        widthInches: screen.widthInputValue || null,
        widthFraction: screen.widthFractionValue || null,
        heightInches: screen.heightInputValue || null,
        heightFraction: screen.heightFractionValue || null,
        widthFeet: screen.width,
        heightFeet: screen.height,
        widthDisplay: screen.actualWidthDisplay,
        heightDisplay: screen.actualHeightDisplay,
        includeInstallation: screen.includeInstallation,
        wiringDistance: screen.wiringDistance || 0,
        photos: (screen.photos || []).filter(p => typeof p === 'object' && p.key),
        sortOrder: screenIndex,
        status: screen.phase === 'configured' ? 'configured' : 'documented'
    };

    try {
        if (screen._openingId) {
            // PATCH existing opening
            await fetch(`${WORKER_URL}/api/openings/${screen._openingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(openingData)
            });
        } else {
            // POST new opening, store the ID back
            const response = await fetch(`${WORKER_URL}/api/openings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(openingData)
            });
            const result = await response.json();
            if (result.success && result.openingId) {
                screensInOrder[screenIndex]._openingId = result.openingId;
            }
        }
        showAutoSaveIndicator();
    } catch (err) {
        console.error('Auto-save opening failed:', err);
    }
}

/**
 * Debounced auto-save for a specific screen index.
 */
function debouncedAutoSaveOpening(screenIndex) {
    clearTimeout(autoSaveTimers[screenIndex]);
    autoSaveTimers[screenIndex] = setTimeout(() => autoSaveOpening(screenIndex), AUTO_SAVE_DEBOUNCE_MS);
}

/**
 * Show a brief "Auto-saved" indicator near the save draft button.
 */
function showAutoSaveIndicator() {
    let indicator = document.getElementById('autoSaveIndicator');
    if (!indicator) {
        indicator = document.createElement('span');
        indicator.id = 'autoSaveIndicator';
        indicator.style.cssText = 'font-size: 0.8rem; color: #28a745; margin-left: 10px; opacity: 0; transition: opacity 0.3s;';
        const draftBtn = document.getElementById('saveDraftBtn');
        if (draftBtn && draftBtn.parentNode) {
            draftBtn.parentNode.insertBefore(indicator, draftBtn.nextSibling);
        }
    }
    indicator.textContent = 'Auto-saved';
    indicator.style.opacity = '1';
    setTimeout(() => { indicator.style.opacity = '0'; }, 2000);
}

// ─── Save Draft (Phase 1 only — no pricing required) ────────────────────────
async function saveDraft() {
    if (isSaving) return;

    if (screensInOrder.length === 0) {
        alert('Please add at least one opening before saving a draft.');
        return;
    }

    isSaving = true;
    const draftBtn = document.getElementById('saveDraftBtn');
    if (draftBtn) draftBtn.disabled = true;

    try {
        // Reuse existing quote ID if we're re-saving, else generate new
        const tempId = (currentQuoteId || Date.now()).toString();

        // Upload pending photos
        for (let i = 0; i < screensInOrder.length; i++) {
            const screen = screensInOrder[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(tempId, i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }

        // Strip Blob objects before serialization
        const screensForSave = screensInOrder.map(s => {
            const { pendingPhotos, ...rest } = s;
            return rest;
        });

        // Get sales rep info
        const salesRepSelect = document.getElementById('salesRepSelect');
        const selectedRepOption = salesRepSelect?.selectedOptions[0];
        const salesRepId = salesRepSelect?.value || '';
        const salesRepName = selectedRepOption?.textContent || '';
        const salesRepEmail = selectedRepOption?.dataset?.email || '';
        const salesRepPhone = selectedRepOption?.dataset?.phone || '';

        const quoteData = {
            id: tempId,
            customerName: document.getElementById('customerName').value || 'Draft',
            companyName: document.getElementById('companyName').value || '',
            customerEmail: document.getElementById('customerEmail').value || '',
            customerPhone: document.getElementById('customerPhone').value || '',
            streetAddress: document.getElementById('streetAddress').value || '',
            aptSuite: document.getElementById('aptSuite').value || '',
            nearestIntersection: document.getElementById('nearestIntersection').value || '',
            city: document.getElementById('city').value || '',
            state: document.getElementById('state').value || '',
            zipCode: document.getElementById('zipCode').value || '',
            screens: screensForSave,
            orderTotalPrice: 0,
            orderTotalMaterialsPrice: 0,
            orderTotalInstallationPrice: 0,
            orderTotalInstallationCost: 0,
            orderTotalCost: 0,
            totalProfit: 0,
            marginPercent: 0,
            hasCableScreen: false,
            totalScreenCosts: 0,
            totalMotorCosts: 0,
            totalAccessoriesCosts: 0,
            totalCableSurcharge: 0,
            discountPercent: parseFloat(document.getElementById('discountPercent').value) || 0,
            discountLabel: document.getElementById('discountLabel').value || '',
            discountAmount: 0,
            discountedMaterialsPrice: 0,
            enableComparison: false,
            comparisonType: 'motor',
            comparisonMotor: '',
            comparisonTrack: '',
            comparisonSkippedCount: 0,
            comparisonTotalMaterialsPrice: 0,
            comparisonDiscountedMaterialsPrice: 0,
            comparisonTotalPrice: 0,
            miscInstallLabel: document.getElementById('miscInstallLabel').value || '',
            miscInstallAmount: parseFloat(document.getElementById('miscInstallAmount').value) || 0,
            miscInstallCost: 0,
            projectAccessories: [],
            projectAccessoriesTotalPrice: 0,
            projectAccessoriesTotalCost: 0,
            airtableOpportunityId: document.getElementById('airtableOpportunityId').value || '',
            airtableContactId: document.getElementById('airtableContactId').value || '',
            airtableOpportunityName: document.getElementById('airtableOpportunityName').value || '',
            internalComments: document.getElementById('internalComments')?.value || '',
            salesRepId, salesRepName, salesRepEmail, salesRepPhone,
            fourWeekGuarantee: document.getElementById('fourWeekGuarantee').checked,
            totalGuaranteeDiscount: 0,
            // Entity IDs for sync (passed back to worker)
            _contactId: currentContactId || null,
            _propertyId: currentPropertyId || null
        };

        const response = await fetch(`${WORKER_URL}/api/save-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (!currentQuoteId) currentQuoteId = tempId; // Lock ID for future re-saves
            // Store entity IDs returned by the worker
            if (result.entities) {
                currentContactId = result.entities.contactId || currentContactId;
                currentPropertyId = result.entities.propertyId || currentPropertyId;
                // Map entity IDs back onto screen objects
                if (result.entities.openingIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.openingIds[i]) s._openingId = result.entities.openingIds[i];
                    });
                }
                if (result.entities.lineItemIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.lineItemIds[i]) s._lineItemId = result.entities.lineItemIds[i];
                    });
                }
            }
            showAutoSaveIndicator();
            loadSavedQuotes();
        } else {
            alert('Failed to save draft: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving draft:', error);
        alert('Failed to save draft. Check your internet connection.\n\nError: ' + error.message);
    } finally {
        isSaving = false;
        if (draftBtn) draftBtn.disabled = false;
    }
}

async function saveQuote() {
    if (isSaving) return;

    if (!window.currentOrderData || !window.currentOrderData.screens || window.currentOrderData.screens.length === 0) {
        alert('Please calculate a quote first');
        return;
    }

    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary.classList.contains('hidden')) {
        alert('Please calculate a quote first');
        return;
    }

    isSaving = true;
    const finalizeBtn = document.querySelector('button[onclick="finalizeProjectDetails()"]');
    if (finalizeBtn) finalizeBtn.disabled = true;

    try {
        // Read fresh internal comments from textarea (may have changed since calculate)
        const internalComments = document.getElementById('internalComments')?.value || '';

        // Build the quote payload from currentOrderData
        const orderData = window.currentOrderData;
        orderData.internalComments = internalComments;

        // Upload pending photos and clean up deletions
        const quoteId = orderData.id.toString();
        for (let i = 0; i < orderData.screens.length; i++) {
            const screen = orderData.screens[i];
            if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
                const uploaded = await uploadPendingPhotos(quoteId, i, screen.pendingPhotos);
                screen.photos = (screen.photos || []).concat(uploaded);
                screen.pendingPhotos = [];
            }
        }
        await deleteMarkedPhotos();

        // Strip Blob objects before serialization
        const screensForSave = orderData.screens.map(s => {
            const { pendingPhotos, ...rest } = s;
            return rest;
        });

        const quoteData = {
            id: quoteId,
            customerName: orderData.customerName,
            companyName: orderData.companyName || '',
            customerEmail: orderData.customerEmail || '',
            customerPhone: orderData.customerPhone || '',
            streetAddress: orderData.streetAddress || '',
            aptSuite: orderData.aptSuite || '',
            nearestIntersection: orderData.nearestIntersection || '',
            city: orderData.city || '',
            state: orderData.state || '',
            zipCode: orderData.zipCode || '',
            screens: screensForSave,
            orderTotalPrice: orderData.orderTotalPrice,
            orderTotalMaterialsPrice: orderData.orderTotalMaterialsPrice,
            orderTotalInstallationPrice: orderData.orderTotalInstallationPrice,
            orderTotalInstallationCost: orderData.orderTotalInstallationCost,
            orderTotalCost: orderData.orderTotalCost,
            totalProfit: orderData.totalProfit,
            marginPercent: orderData.marginPercent,
            hasCableScreen: orderData.hasCableScreen,
            totalScreenCosts: orderData.totalScreenCosts,
            totalMotorCosts: orderData.totalMotorCosts,
            totalAccessoriesCosts: orderData.totalAccessoriesCosts,
            totalCableSurcharge: orderData.totalCableSurcharge,
            discountPercent: orderData.discountPercent,
            discountLabel: orderData.discountLabel,
            discountAmount: orderData.discountAmount,
            discountedMaterialsPrice: orderData.discountedMaterialsPrice,
            enableComparison: orderData.enableComparison,
            comparisonType: orderData.comparisonType || 'motor',
            comparisonMotor: orderData.comparisonMotor,
            comparisonTrack: orderData.comparisonTrack || '',
            comparisonSkippedCount: orderData.comparisonSkippedCount || 0,
            comparisonTotalMaterialsPrice: orderData.comparisonTotalMaterialsPrice,
            comparisonDiscountedMaterialsPrice: orderData.comparisonDiscountedMaterialsPrice,
            comparisonTotalPrice: orderData.comparisonTotalPrice,
            // Extra misc install cost
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: orderData.miscInstallAmount || 0,
            miscInstallCost: orderData.miscInstallCost || 0,
            // Project-level accessories
            projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
            projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
            projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
            // Airtable integration fields
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            airtableOpportunityName: orderData.airtableOpportunityName || '',
            internalComments: internalComments,
            // Sales Rep info
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || '',
            // 4-Week Install Guarantee
            fourWeekGuarantee: orderData.fourWeekGuarantee || false,
            totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0,
            // Entity IDs for sync (passed back to worker)
            _contactId: currentContactId || null,
            _propertyId: currentPropertyId || null
        };

        // If sales rep changed and opportunity is linked, update Airtable
        const currentRepId = orderData.salesRepId || '';
        if (currentRepId && originalSalesRepId && currentRepId !== originalSalesRepId && orderData.airtableOpportunityId) {
            try {
                await fetch(`${WORKER_URL}/api/airtable/opportunities/update-rep`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        opportunityId: orderData.airtableOpportunityId,
                        salesRepId: currentRepId
                    })
                });
                originalSalesRepId = currentRepId; // Update tracked ID after successful change
            } catch (repError) {
                console.error('Failed to update sales rep on Airtable:', repError);
                // Non-blocking — quote still saves
            }
        }

        const response = await fetch(`${WORKER_URL}/api/save-quote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(quoteData)
        });

        const result = await response.json();

        if (response.ok && result.success) {
            if (!currentQuoteId) currentQuoteId = quoteId; // Lock ID for future re-saves
            // Write quoteNumber back so PDFs generated after saving show the real number
            if (result.quoteNumber) {
                window.currentOrderData.quoteNumber = result.quoteNumber;
            }
            // Store entity IDs returned by the worker
            if (result.entities) {
                currentContactId = result.entities.contactId || currentContactId;
                currentPropertyId = result.entities.propertyId || currentPropertyId;
                if (result.entities.openingIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.openingIds[i]) s._openingId = result.entities.openingIds[i];
                    });
                }
                if (result.entities.lineItemIds) {
                    screensInOrder.forEach((s, i) => {
                        if (result.entities.lineItemIds[i]) s._lineItemId = result.entities.lineItemIds[i];
                    });
                }
            }
            if (result.airtableSync === false) {
                let msg = 'Note: Airtable sync failed. Quote saved locally only.';
                if (result.airtableSyncError) {
                    msg += '\nReason: ' + result.airtableSyncError;
                }
                alert(msg);
            }
            showAutoSaveIndicator();
            loadSavedQuotes();
        } else {
            alert('Failed to save quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error saving quote:', error);
        alert('Failed to save quote. Please check your internet connection.\n\nError: ' + error.message);
    } finally {
        isSaving = false;
        if (finalizeBtn) finalizeBtn.disabled = false;
    }
}

async function loadSavedQuotes() {
    const savedQuotesList = document.getElementById('savedQuotesList');
    savedQuotesList.innerHTML = '<p style="color: #666;">Loading quotes...</p>';

    try {
        const response = await fetch(`${WORKER_URL}/api/quotes`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            savedQuotesList.innerHTML = '<p style="color: #c00;">Failed to load quotes.</p>';
            return;
        }

        const quotes = result.quotes;

        if (!quotes || quotes.length === 0) {
            savedQuotesList.innerHTML = '<p style="color: #666;">No saved quotes yet.</p>';
            return;
        }

        let html = '';
        quotes.forEach(quote => {
            const date = new Date(quote.created_at).toLocaleDateString();
            const screenCount = quote.screen_count || 0;
            const isDraft = !quote.total_price || quote.total_price === 0;
            const totalPrice = isDraft ? null : formatCurrency(quote.total_price);
            const quoteNum = quote.quote_number ? `<p><strong>Quote #:</strong> ${quote.quote_number}</p>` : '';

            // Status badge logic
            const quoteStatus = quote.quote_status || 'draft';
            const paymentStatus = quote.payment_status || 'unpaid';
            let statusBadge = '';
            let borderColor = '';
            if (paymentStatus === 'paid') {
                statusBadge = '<span style="background: #6f42c1; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">PAID</span>';
                borderColor = '#6f42c1';
            } else if (quoteStatus === 'signed') {
                statusBadge = '<span style="background: #28a745; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">SIGNED</span>';
                borderColor = '#28a745';
            } else if (quoteStatus === 'sent') {
                statusBadge = '<span style="background: #0071bc; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">SENT</span>';
                borderColor = '#0071bc';
            } else if (isDraft) {
                statusBadge = '<span style="background: #e67e22; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-left: 8px;">DRAFT</span>';
                borderColor = '#e67e22';
            }

            html += `
                <div class="quote-card" ${borderColor ? `style="border-left: 3px solid ${borderColor};"` : ''}>
                    <h4>${quote.customer_name}${statusBadge}</h4>
                    ${quoteNum}
                    <p><strong>Date:</strong> ${date}</p>
                    <p><strong>Screens:</strong> ${screenCount}</p>
                    ${totalPrice ? `<p><strong>Total:</strong> ${totalPrice}</p>` : ''}
                    <div class="quote-card-actions">
                        <button class="btn-primary" onclick="loadQuote('${quote.id}')">Load</button>
                        <button class="btn-secondary" onclick="viewSentEmails('${quote.id}')">Emails</button>
                        <button class="btn-secondary" onclick="deleteQuote('${quote.id}')">Delete</button>
                    </div>
                </div>
            `;
        });

        savedQuotesList.innerHTML = html;
    } catch (error) {
        console.error('Error loading quotes:', error);
        savedQuotesList.innerHTML = '<p style="color: #c00;">Failed to load quotes. Check your connection.</p>';
    }
}

async function loadQuote(quoteId) {
    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            alert('Failed to load quote: ' + (result.error || 'Quote not found'));
            return;
        }

        const quote = result.quote;
        currentQuoteId = quote.id; // Preserve loaded quote's ID for re-save

        // Store entity IDs from lazy migration or cached response
        const entities = result.entities || {};
        currentContactId = entities.contactId || null;
        currentPropertyId = entities.propertyId || null;

        // Map entity IDs onto screen objects (by index, matching openingIds/lineItemIds arrays)
        if (entities.openingIds && quote.screens) {
            quote.screens.forEach((screen, i) => {
                if (entities.openingIds[i]) screen._openingId = entities.openingIds[i];
            });
        }
        if (entities.lineItemIds && quote.screens) {
            quote.screens.forEach((screen, i) => {
                if (entities.lineItemIds[i]) screen._lineItemId = entities.lineItemIds[i];
            });
        }

        // Populate customer fields
        document.getElementById('customerName').value = quote.customerName || '';
        document.getElementById('companyName').value = quote.companyName || '';
        document.getElementById('customerEmail').value = quote.customerEmail || '';
        document.getElementById('customerPhone').value = quote.customerPhone || '';
        document.getElementById('streetAddress').value = quote.streetAddress || '';
        document.getElementById('aptSuite').value = quote.aptSuite || '';
        document.getElementById('nearestIntersection').value = quote.nearestIntersection || '';
        document.getElementById('city').value = quote.city || '';
        document.getElementById('state').value = quote.state || '';
        document.getElementById('zipCode').value = quote.zipCode || '';

        // Show optional fields if any have values
        if (quote.companyName || quote.aptSuite || quote.nearestIntersection) {
            document.getElementById('optionalCustomerFields').style.display = 'block';
            document.getElementById('toggleOptionalFields').textContent = '− Hide Addnl Fields';
        }

        // Restore Airtable link state
        if (quote.airtableOpportunityId) {
            document.getElementById('airtableOpportunityId').value = quote.airtableOpportunityId;
            document.getElementById('airtableContactId').value = quote.airtableContactId || '';
            document.getElementById('airtableOpportunityName').value = quote.airtableOpportunityName || '';
            const banner = document.getElementById('linkedOpportunityBanner');
            banner.classList.remove('hidden');
            banner.style.display = 'flex';
            const oppName = quote.airtableOpportunityName || '';
            document.getElementById('linkedOpportunityText').textContent =
                'Linked to Airtable Opportunity' + (oppName ? ' ' + oppName : '');
        } else {
            document.getElementById('airtableOpportunityId').value = '';
            document.getElementById('airtableContactId').value = '';
            document.getElementById('airtableOpportunityName').value = '';
            const banner = document.getElementById('linkedOpportunityBanner');
            banner.classList.add('hidden');
            banner.style.display = 'none';
        }

        // Restore Sales Rep dropdown
        if (quote.salesRepId) {
            document.getElementById('salesRepSelect').value = quote.salesRepId;
            originalSalesRepId = quote.salesRepId;
        } else if (quote.salesRepName) {
            // Legacy fallback: match by name if no ID saved
            const select = document.getElementById('salesRepSelect');
            for (const option of select.options) {
                if (option.textContent === quote.salesRepName) {
                    select.value = option.value;
                    originalSalesRepId = option.value;
                    break;
                }
            }
        } else {
            document.getElementById('salesRepSelect').value = '';
            originalSalesRepId = '';
        }
        updateSalesRepInfo();

        // Restore screens into the order
        if (quote.screens && quote.screens.length > 0) {
            // Backward compatibility: screens without phase field default to 'configured'
            quote.screens.forEach(s => {
                if (!s.phase) s.phase = 'configured';
            });

            screensInOrder = quote.screens;
            renderScreensList();
            document.getElementById('screensInOrder').classList.remove('hidden');

            // Restore discount settings
            document.getElementById('discountPercent').value = quote.discountPercent || 0;
            document.getElementById('discountLabel').value = quote.discountLabel || '';

            // Restore misc install fields
            document.getElementById('miscInstallLabel').value = quote.miscInstallLabel || '';
            document.getElementById('miscInstallAmount').value = quote.miscInstallAmount || '';

            // Restore project accessories
            if (quote.projectAccessories && quote.projectAccessories.length > 0) {
                projectAccessories = quote.projectAccessories;
            } else {
                projectAccessories = [];
            }

            // Restore comparison settings
            if (quote.enableComparison) {
                document.getElementById('enableComparison').checked = true;
                document.getElementById('comparisonOptions').style.display = 'grid';
                // Restore comparison type radio
                const compType = quote.comparisonType || 'motor';
                const compRadio = document.querySelector(`input[name="comparisonType"][value="${compType}"]`);
                if (compRadio) compRadio.checked = true;
                updateComparisonUI();
                // Restore motor/track selection
                if (quote.comparisonMotor) {
                    document.getElementById('comparisonMotor').value = quote.comparisonMotor;
                }
                if (quote.comparisonTrack) {
                    document.getElementById('comparisonTrack').value = quote.comparisonTrack;
                }
            }

            // Restore guarantee checkbox
            if (quote.fourWeekGuarantee) {
                document.getElementById('fourWeekGuarantee').checked = true;
            }

            // Only show order summary if all screens are configured (not a draft)
            const hasUnconfigured = quote.screens.some(s => s.phase === 'opening');
            if (!hasUnconfigured) {
                window.currentOrderData = quote;
                displayOrderQuoteSummary(quote);
            }
        }

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
        console.error('Error loading quote:', error);
        alert('Failed to load quote. Please check your internet connection.\n\nError: ' + error.message);
    }
}

async function deleteQuote(quoteId) {
    if (!confirm('Are you sure you want to delete this quote?')) return;

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}`, {
            method: 'DELETE'
        });

        const result = await response.json();

        if (response.ok && result.success) {
            loadSavedQuotes();
        } else {
            alert('Failed to delete quote: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting quote:', error);
        alert('Failed to delete quote. Please check your internet connection.\n\nError: ' + error.message);
    }
}

// ─── Sent Emails Viewer ──────────────────────────────────────────────────────
async function viewSentEmails(quoteId) {
    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${quoteId}/emails`);
        const result = await response.json();

        if (!response.ok || !result.success) {
            alert('Failed to load emails: ' + (result.error || 'Unknown error'));
            return;
        }

        const emails = result.emails || [];
        showEmailsModal(emails);
    } catch (error) {
        console.error('Error loading emails:', error);
        alert('Failed to load emails.');
    }
}

function showEmailsModal(emails) {
    // Remove existing modal if any
    const existing = document.getElementById('emailsModal');
    if (existing) existing.remove();

    const typeLabels = {
        'quote': 'Quote Email',
        'signature-request': 'Signature Request',
        'payment-confirmation': 'Payment Confirmation',
        'production': 'Production Order'
    };

    let content = '';
    if (emails.length === 0) {
        content = '<p style="color: #666; text-align: center; padding: 20px;">No emails sent yet for this quote.</p>';
    } else {
        emails.forEach(email => {
            const date = new Date(email.sentAt).toLocaleString();
            const type = typeLabels[email.type] || email.type || 'Email';
            const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
            const cc = email.cc && email.cc.length > 0 ? `<br><span style="color: #888;">CC: ${email.cc.join(', ')}</span>` : '';
            content += `
                <div style="padding: 12px; border-bottom: 1px solid #eee;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="color: #004a95;">${type}</strong>
                        <span style="color: #888; font-size: 0.85rem;">${date}</span>
                    </div>
                    <div style="font-size: 0.9rem; margin-top: 4px;">
                        <strong>To:</strong> ${to}${cc}
                    </div>
                    <div style="font-size: 0.85rem; color: #555; margin-top: 2px;">${email.subject || ''}</div>
                </div>
            `;
        });
    }

    const modal = document.createElement('div');
    modal.id = 'emailsModal';
    modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;';
    modal.innerHTML = `
        <div style="background: white; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow: hidden; display: flex; flex-direction: column;">
            <div style="padding: 16px 20px; border-bottom: 2px solid #004a95; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; color: #004a95;">Sent Emails (${emails.length})</h3>
                <button onclick="document.getElementById('emailsModal').remove()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666;">&times;</button>
            </div>
            <div style="overflow-y: auto; flex: 1;">${content}</div>
        </div>
    `;
    modal.addEventListener('click', function(e) {
        if (e.target === modal) modal.remove();
    });
    document.body.appendChild(modal);
}

/**
 * Refresh the inline email history in the quote summary.
 * Fetches sent emails for the current quote and renders them inline.
 */
async function refreshEmailHistory() {
    if (!currentQuoteId) return;

    const section = document.getElementById('emailHistorySection');
    const listEl = document.getElementById('emailHistoryList');
    const countEl = document.getElementById('emailHistoryCount');
    if (!section || !listEl) return;

    try {
        const response = await fetch(`${WORKER_URL}/api/quote/${currentQuoteId}/emails`);
        const result = await response.json();

        if (!response.ok || !result.success) return;

        const emails = result.emails || [];

        if (emails.length === 0) {
            section.style.display = 'none';
            return;
        }

        const typeLabels = {
            'quote': 'Quote Email',
            'signature-request': 'Signature Request',
            'signature-customer-confirmation': 'Signature Confirmation',
            'payment-confirmation': 'Payment Confirmation',
            'production': 'Production Order'
        };

        const typeColors = {
            'quote': '#0071bc',
            'signature-request': '#e67e22',
            'signature-customer-confirmation': '#28a745',
            'payment-confirmation': '#6f42c1',
            'production': '#dc3545'
        };

        let html = '';
        emails.forEach(email => {
            const date = new Date(email.sentAt).toLocaleString();
            const type = typeLabels[email.type] || email.type || 'Email';
            const color = typeColors[email.type] || '#666';
            const to = Array.isArray(email.to) ? email.to.join(', ') : email.to;
            html += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 0.85rem;">
                    <div>
                        <span style="font-weight: 600; color: ${color};">${type}</span>
                        <span style="color: #888;"> → ${to}</span>
                    </div>
                    <span style="color: #999; font-size: 0.8rem; white-space: nowrap; margin-left: 12px;">${date}</span>
                </div>
            `;
        });

        countEl.textContent = `(${emails.length})`;
        listEl.innerHTML = html;
        section.style.display = '';
    } catch (err) {
        console.error('Failed to load email history:', err);
    }
}

async function autoSaveQuote() {
    if (!window.currentOrderData) return;
    try {
        await saveQuote();
        // Show brief saved indicator
        const indicator = document.getElementById('autoSaveQuoteIndicator');
        if (indicator) {
            indicator.style.display = '';
            setTimeout(() => { indicator.style.display = 'none'; }, 2500);
        }
    } catch (err) {
        console.error('Auto-save failed:', err);
        // Silent failure — user can still manually trigger save actions
    }
}

async function ensureQuoteSaved() {
    const orderData = window.currentOrderData;
    if (!orderData) return false;

    // Read fresh internal comments
    const internalComments = document.getElementById('internalComments')?.value || '';
    orderData.internalComments = internalComments;

    // Upload any pending photos for each screen
    const quoteId = orderData.id.toString();
    for (let i = 0; i < orderData.screens.length; i++) {
        const screen = orderData.screens[i];
        if (screen.pendingPhotos && screen.pendingPhotos.length > 0) {
            const uploaded = await uploadPendingPhotos(quoteId, i, screen.pendingPhotos);
            screen.photos = (screen.photos || []).concat(uploaded);
            screen.pendingPhotos = [];
        }
    }

    // Delete any photos that were removed
    await deleteMarkedPhotos();

    // Strip File/Blob objects before serialization (they can't be JSON-stringified)
    const screensForSave = orderData.screens.map(s => {
        const { pendingPhotos, ...rest } = s;
        return rest;
    });

    const response = await fetch(`${WORKER_URL}/api/save-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            id: orderData.id.toString(),
            customerName: orderData.customerName,
            companyName: orderData.companyName || '',
            customerEmail: orderData.customerEmail || '',
            customerPhone: orderData.customerPhone || '',
            streetAddress: orderData.streetAddress || '',
            aptSuite: orderData.aptSuite || '',
            nearestIntersection: orderData.nearestIntersection || '',
            city: orderData.city || '',
            state: orderData.state || '',
            zipCode: orderData.zipCode || '',
            screens: screensForSave,
            orderTotalPrice: orderData.orderTotalPrice,
            orderTotalMaterialsPrice: orderData.orderTotalMaterialsPrice,
            orderTotalInstallationPrice: orderData.orderTotalInstallationPrice,
            orderTotalInstallationCost: orderData.orderTotalInstallationCost,
            orderTotalCost: orderData.orderTotalCost,
            totalProfit: orderData.totalProfit,
            marginPercent: orderData.marginPercent,
            hasCableScreen: orderData.hasCableScreen,
            totalScreenCosts: orderData.totalScreenCosts,
            totalMotorCosts: orderData.totalMotorCosts,
            totalAccessoriesCosts: orderData.totalAccessoriesCosts,
            totalCableSurcharge: orderData.totalCableSurcharge,
            discountPercent: orderData.discountPercent,
            discountLabel: orderData.discountLabel,
            discountAmount: orderData.discountAmount,
            discountedMaterialsPrice: orderData.discountedMaterialsPrice,
            enableComparison: orderData.enableComparison,
            comparisonType: orderData.comparisonType || 'motor',
            comparisonMotor: orderData.comparisonMotor,
            comparisonTrack: orderData.comparisonTrack || '',
            comparisonSkippedCount: orderData.comparisonSkippedCount || 0,
            comparisonTotalMaterialsPrice: orderData.comparisonTotalMaterialsPrice,
            comparisonDiscountedMaterialsPrice: orderData.comparisonDiscountedMaterialsPrice,
            comparisonTotalPrice: orderData.comparisonTotalPrice,
            miscInstallLabel: orderData.miscInstallLabel || '',
            miscInstallAmount: orderData.miscInstallAmount || 0,
            miscInstallCost: orderData.miscInstallCost || 0,
            projectAccessories: (orderData.projectAccessories || []).filter(a => a.quantity > 0),
            projectAccessoriesTotalPrice: orderData.projectAccessoriesTotalPrice || 0,
            projectAccessoriesTotalCost: orderData.projectAccessoriesTotalCost || 0,
            airtableOpportunityId: orderData.airtableOpportunityId || '',
            airtableContactId: orderData.airtableContactId || '',
            airtableOpportunityName: orderData.airtableOpportunityName || '',
            internalComments: internalComments,
            salesRepId: orderData.salesRepId || '',
            salesRepName: orderData.salesRepName || '',
            salesRepEmail: orderData.salesRepEmail || '',
            salesRepPhone: orderData.salesRepPhone || '',
            fourWeekGuarantee: orderData.fourWeekGuarantee || false,
            totalGuaranteeDiscount: orderData.totalGuaranteeDiscount || 0
        })
    });

    const result = await response.json();

    if (response.ok && result.success) {
        return true;
    } else {
        alert('Failed to save quote: ' + (result.error || 'Unknown error'));
        return false;
    }
}

// ─── Node.js exports (for testing) ───────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        autoSaveOpening, debouncedAutoSaveOpening, showAutoSaveIndicator,
        saveDraft, saveQuote, loadSavedQuotes, loadQuote, deleteQuote,
        viewSentEmails, showEmailsModal, refreshEmailHistory,
        autoSaveQuote, ensureQuoteSaved
    };
}