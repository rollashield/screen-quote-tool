/**
 * screen-cards.js
 * Screen card rendering, inline editing, Phase 2 selectors, and project accessories.
 *
 * Dependencies:
 *   - pricing-engine.js must be loaded first (provides computeScreenPricing, getTrackTypeOptions,
 *     getOperatorOptionsForTrack, getFabricOptions, getFrameColorOptions, escapeAttr,
 *     buildSelectOptionsHtml, formatCurrency, getTrackTypeName, getOperatorTypeName,
 *     getFabricName, getFrameColorName, getClientFacingTrackName, getClientFacingOperatorName)
 *   - pricing-data.js must be loaded first (provides SUNAIR_DISCOUNT, CUSTOMER_MARKUP, accessories)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - screensInOrder: Array of screen objects
 *   - editingScreenIndex: Index of screen being edited, or null
 *   - currentQuoteId: Active quote's DB ID
 *   - existingScreenPhotos, pendingScreenPhotos: Photo arrays
 *   - projectAccessories: Array of project-level accessories
 *
 * Extracted from app.js in Step 2 refactoring.
 */

// ─── Screen Exclude Toggle ───────────────────────────────────────────────────

function toggleExclude(index) {
    const screen = screensInOrder[index];
    if (!screen) return;
    screen.excluded = !screen.excluded;
    renderScreensList();
    // If quote summary is visible, recalculate
    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary && !quoteSummary.classList.contains('hidden')) {
        calculateOrderQuote();
    }
}

// ─── Project Accessories (A La Carte) ─────────────────────────────────────

function getApplicableProjectAccessories() {
    // Scan screens for motor brands present
    const motorBrands = new Set();
    let hasSolar = false;
    screensInOrder.forEach(screen => {
        if (screen.operatorType === 'gaposa-rts' || screen.operatorType === 'gaposa-solar') {
            motorBrands.add('gaposa');
        }
        if (screen.operatorType === 'somfy-rts') {
            motorBrands.add('somfy');
        }
        if (screen.operatorType === 'gaposa-solar') {
            hasSolar = true;
        }
    });

    const items = [];
    motorBrands.forEach(brand => {
        let brandAccessories = accessories[brand] || [];
        brandAccessories.forEach(acc => {
            // Filter extension cord: only show if solar motor present
            if (acc.id === 'gaposa-solar-ext' && !hasSolar) return;
            items.push({ ...acc, brand });
        });
    });
    return items;
}

function renderProjectAccessories() {
    const listEl = document.getElementById('projectAccessoriesList');
    const available = getApplicableProjectAccessories();

    if (available.length === 0) {
        listEl.innerHTML = '<p style="color: #666; font-size: 0.85rem;">No motorized screens in order. Add screens with motors to see available accessories.</p>';
        return;
    }

    let html = '<div style="display: flex; flex-direction: column; gap: 8px;">';
    available.forEach(acc => {
        // Calculate customer price (same markup logic as per-screen)
        let customerPrice;
        if (acc.markup) {
            customerPrice = acc.cost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
        } else {
            customerPrice = acc.cost;
        }

        // Find existing quantity from projectAccessories
        const existing = projectAccessories.find(pa => pa.id === acc.id);
        const qty = existing ? existing.quantity : 0;
        const lineTotal = customerPrice * qty;

        html += `
            <div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px; background: #f8f9fa; border-radius: 4px; flex-wrap: wrap;">
                <span style="flex: 1; min-width: 180px; font-size: 0.9rem;">${acc.name}</span>
                <span style="color: #666; font-size: 0.85rem; min-width: 80px; text-align: right;">$${customerPrice.toFixed(2)} ea</span>
                <div style="display: flex; align-items: center; gap: 4px;">
                    <button type="button" onclick="updateProjectAccessoryQuantity('${acc.id}', ${qty - 1})"
                            style="width: 28px; height: 28px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 1rem; line-height: 1;"
                            ${qty <= 0 ? 'disabled' : ''}>−</button>
                    <span style="width: 28px; text-align: center; font-weight: 600; font-size: 0.9rem;">${qty}</span>
                    <button type="button" onclick="updateProjectAccessoryQuantity('${acc.id}', ${qty + 1})"
                            style="width: 28px; height: 28px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; font-size: 1rem; line-height: 1;"
                            ${qty >= 10 ? 'disabled' : ''}>+</button>
                </div>
                <span style="min-width: 80px; text-align: right; font-weight: 600; font-size: 0.9rem; color: ${lineTotal > 0 ? '#0056A3' : '#999'};">
                    ${lineTotal > 0 ? '$' + lineTotal.toFixed(2) : '—'}
                </span>
            </div>
        `;
    });
    html += '</div>';
    listEl.innerHTML = html;
}

function toggleProjectAccessories() {
    const listEl = document.getElementById('projectAccessoriesList');
    const btn = document.getElementById('toggleProjectAccBtn');
    if (listEl.style.display === 'none') {
        listEl.style.display = 'block';
        btn.textContent = 'Hide Project Accessories';
        renderProjectAccessories();
    } else {
        listEl.style.display = 'none';
        btn.textContent = 'Add Project Accessories';
    }
}

function updateProjectAccessoryQuantity(accId, newQty) {
    if (newQty < 0) newQty = 0;
    if (newQty > 10) newQty = 10;

    const available = getApplicableProjectAccessories();
    const accDef = available.find(a => a.id === accId);
    if (!accDef) return;

    // Calculate customer price
    let customerPrice;
    if (accDef.markup) {
        customerPrice = accDef.cost * (1 - SUNAIR_DISCOUNT) * CUSTOMER_MARKUP;
    } else {
        customerPrice = accDef.cost;
    }

    // Update or add/remove from projectAccessories array
    const idx = projectAccessories.findIndex(pa => pa.id === accId);
    if (newQty === 0) {
        if (idx >= 0) projectAccessories.splice(idx, 1);
    } else {
        const entry = {
            id: accDef.id,
            name: accDef.name,
            cost: accDef.cost,
            markup: accDef.markup,
            quantity: newQty,
            customerPrice: customerPrice
        };
        if (idx >= 0) {
            projectAccessories[idx] = entry;
        } else {
            projectAccessories.push(entry);
        }
    }

    renderProjectAccessories();
}

// ─── Screen Card Rendering ─────────────────────────────────────────────────

function renderScreensList() {
    const screensList = document.getElementById('screensList');
    const screenCount = document.getElementById('screenCount');
    const statusBar = document.getElementById('screenStatusBar');

    screenCount.textContent = screensInOrder.length;

    // Show/hide guarantee section based on whether any screens exist
    const guaranteeEl = document.getElementById('guaranteeSection');
    if (guaranteeEl) {
        guaranteeEl.style.display = screensInOrder.length > 0 ? '' : 'none';
    }

    if (screensInOrder.length === 0) {
        screensList.innerHTML = '<p>No screens added yet.</p>';
        statusBar.style.display = 'none';
        updatePhase2Visibility();
        return;
    }

    // Count phases
    const openingCount = screensInOrder.filter(s => s.phase === 'opening').length;
    const configuredCount = screensInOrder.filter(s => s.phase === 'configured').length;

    // Status bar
    if (openingCount > 0 || configuredCount > 0) {
        const parts = [`${screensInOrder.length} opening${screensInOrder.length !== 1 ? 's' : ''}`];
        if (configuredCount > 0) parts.push(`<strong style="color: #28a745;">${configuredCount} configured</strong>`);
        if (openingCount > 0) parts.push(`<strong style="color: #e67e22;">${openingCount} need${openingCount !== 1 ? '' : 's'} configuration</strong>`);
        statusBar.innerHTML = parts.join(' · ');
        statusBar.style.display = 'block';
    } else {
        statusBar.style.display = 'none';
    }

    let html = '';
    screensInOrder.forEach((screen, index) => {
        const displayName = screen.screenName || `Opening ${index + 1}`;
        const isEditing = editingScreenIndex === index;
        const photoCount = (screen.photos || []).length + (screen.pendingPhotos || []).length;

        if (screen.phase === 'opening') {
            // ─── Opening card (amber/dashed, no pricing) ───
            html += `
                <div class="screen-card ${isEditing ? 'editing' : ''}" style="border: 2px dashed #e67e22; background: #fef9f3;">
                    <div class="screen-card-header">
                        <h4>
                            <span style="background: #e67e22; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-right: 6px;">OPENING</span>
                            ${displayName}${isEditing ? ' <span style="color: #007bff;">(Editing...)</span>' : ''}
                        </h4>
                        <div class="screen-card-actions">
                            <button class="btn-edit" onclick="configureOpening(${index})" style="background: #004a95; color: white;">Configure</button>
                            <button class="btn-edit" onclick="editScreen(${index})">${isEditing ? 'Editing ↑' : 'Edit'}</button>
                            <button class="btn-remove" onclick="removeScreen(${index})">Remove</button>
                        </div>
                    </div>
                    <div class="screen-card-details">
                        <strong>Size:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H
                        <br>
                        ${screen.includeInstallation ? '<strong>Installation:</strong> Included' : '<strong>Installation:</strong> Not included'}
                        ${screen.wiringDistance > 0 ? ` | <strong>Wiring:</strong> ${screen.wiringDistance} ft` : ''}
                        ${photoCount > 0 ? ` | <strong>Photos:</strong> ${photoCount}` : ''}
                        ${screen.openingNotes ? `<br><span style="color: #555; font-size: 0.8rem; font-style: italic;">${escapeHtml(screen.openingNotes)}</span>` : ''}
                        ${(screen.preferredTrackType || screen.preferredOperator || screen.preferredFabric || screen.preferredFrameColor) ? `<br><span style="color: #e67e22; font-size: 0.8rem;"><strong>Pref:</strong> ${[screen.preferredTrackType ? getTrackTypeName(screen.preferredTrackType) : '', screen.preferredOperator ? getOperatorTypeName(screen.preferredTrackType || '', screen.preferredOperator) : '', screen.preferredFabric ? getFabricName(screen.preferredFabric) : '', screen.preferredFrameColor ? getFrameColorName(screen.preferredFrameColor) : ''].filter(Boolean).join(' / ')}</span>` : ''}
                    </div>
                </div>
            `;
        } else {
            // ─── Configured screen card (blue/solid, with pricing) ───
            const clientTrackName = getClientFacingTrackName(screen.trackTypeName);
            const clientMotorName = getClientFacingOperatorName(screen.operatorType, screen.operatorTypeName);
            const accessoriesText = (screen.accessories || []).length > 0
                ? screen.accessories.map(a => a.name).join(', ')
                : 'None';

            const isExcluded = screen.excluded;
            const excludeBtn = isExcluded
                ? `<button class="btn-include" onclick="toggleExclude(${index})">Include</button>`
                : `<button class="btn-exclude" onclick="toggleExclude(${index})">Exclude</button>`;

            const inlineEditorHtml = isEditing ? renderInlineEditor(index) : '';

            html += `
                <div class="screen-card ${isEditing ? 'editing' : ''} ${isExcluded ? 'excluded' : ''}">
                    <div class="screen-card-header">
                        <h4>
                            <span style="background: ${isExcluded ? '#999' : '#004a95'}; color: white; font-size: 0.7rem; font-weight: 700; padding: 2px 7px; border-radius: 8px; margin-right: 6px;">${isExcluded ? 'EXCLUDED' : 'CONFIGURED'}</span>
                            ${displayName}${isEditing ? ' <span style="color: #007bff;">(Editing...)</span>' : ''}
                        </h4>
                        <div class="screen-card-actions">
                            ${isEditing ? '' : `<button class="btn-edit" onclick="editScreen(${index})">Edit</button>`}
                            ${isEditing ? '' : `<button class="btn-duplicate" onclick="duplicateScreen(${index})">Duplicate</button>`}
                            ${isEditing ? '' : excludeBtn}
                            ${isEditing ? '' : `<button class="btn-remove" onclick="removeScreen(${index})">Remove</button>`}
                        </div>
                    </div>
                    <div class="screen-card-details">
                        <strong>Track:</strong> ${clientTrackName} |
                        <strong>Motor:</strong> ${clientMotorName}<br>
                        <strong>Size:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H |
                        <strong>Fabric:</strong> ${screen.fabricColorName} |
                        <strong>Frame:</strong> ${screen.frameColorName || 'Not specified'}<br>
                        ${screen.noTracks ? '<strong>Configuration:</strong> No Tracks<br>' : ''}
                        <strong>Accessories:</strong> ${accessoriesText}<br>
                        ${screen.includeInstallation ? '<strong>Installation:</strong> Included<br>' : ''}
                        ${screen.wiringDistance > 0 ? `<strong>Wiring:</strong> ${screen.wiringDistance} ft<br>` : ''}
                        ${photoCount > 0 ? `<strong>Photos:</strong> ${photoCount}<br>` : ''}
                        ${screen.openingNotes ? `<span style="color: #555; font-size: 0.8rem; font-style: italic;">${escapeHtml(screen.openingNotes)}</span><br>` : ''}
                        <strong>Price:</strong> ${isExcluded ? '<s>' + formatCurrency(screen.customerPrice) + '</s>' : formatCurrency(screen.customerPrice)}
                    </div>
                    ${inlineEditorHtml}
                </div>
            `;
        }
    });

    screensList.innerHTML = html;

    // Show/hide project accessories section based on configured screens
    const projAccSection = document.getElementById('projectAccessoriesSection');
    if (configuredCount > 0) {
        projAccSection.style.display = 'block';
        const listEl = document.getElementById('projectAccessoriesList');
        if (listEl.style.display !== 'none') {
            renderProjectAccessories();
        }
    } else {
        projAccSection.style.display = 'none';
        projectAccessories = [];
    }

    // Update Phase 2 section visibility and opening selector
    updatePhase2Visibility();
}

function editScreen(index) {
    const screen = screensInOrder[index];
    editingScreenIndex = index;
    const displayName = screen.screenName || `Opening ${index + 1}`;

    // Populate Phase 1 form fields (common to both openings and configured screens)
    document.getElementById('screenName').value = screen.screenName || '';
    document.getElementById('includeInstallation').checked = screen.includeInstallation;
    document.getElementById('wiringDistance').value = screen.wiringDistance || '';
    document.getElementById('openingNotes').value = screen.openingNotes || '';
    updateWiringVisibility();

    // Restore photos
    existingScreenPhotos = (screen.photos || []).slice();
    pendingScreenPhotos = (screen.pendingPhotos || []).slice();
    renderPhotoPreview();

    // Set dimensions from stored raw values or from rounded feet
    if (screen.widthInputValue !== undefined) {
        document.getElementById('widthInches').value = screen.widthInputValue;
        document.getElementById('widthFraction').value = screen.widthFractionValue || '';
        document.getElementById('heightInches').value = screen.heightInputValue;
        document.getElementById('heightFraction').value = screen.heightFractionValue || '';
    } else {
        document.getElementById('widthInches').value = screen.width * 12;
        document.getElementById('widthFraction').value = '';
        document.getElementById('heightInches').value = screen.height * 12;
        document.getElementById('heightFraction').value = '';
    }
    updatePricingDimensions();
    checkDimensionLimits();

    // Restore quick config preferences for openings
    if (screen.phase === 'opening') {
        if (screen.preferredTrackType) {
            document.getElementById('prefTrackType').value = screen.preferredTrackType;
            updatePrefOperatorOptions();
            if (screen.preferredOperator) {
                document.getElementById('prefOperator').value = screen.preferredOperator;
            }
        }
        if (screen.preferredFabric) document.getElementById('prefFabric').value = screen.preferredFabric;
        if (screen.preferredFrameColor) document.getElementById('prefFrameColor').value = screen.preferredFrameColor;
        if (screen.preferredTrackType || screen.preferredOperator || screen.preferredFabric || screen.preferredFrameColor) {
            document.getElementById('quickConfigBody').style.display = 'block';
            document.getElementById('quickConfigToggleIcon').innerHTML = '&#9650;';
        }
    }

    if (screen.phase === 'configured') {
        // Use inline editing for configured screens — no scroll, no form population
        editingScreenIndex = index;
        renderScreensList();
        // Scroll to the card being edited
        setTimeout(() => {
            const cards = document.querySelectorAll('#screensList .screen-card');
            if (cards[index]) cards[index].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 50);
        return; // Exit early — inline editor handles the rest
    }

    // Update button text to show we're editing
    updateAddToOrderButton();
    updatePhase1Header();

    // Update the screen card display to show editing state
    renderScreensList();

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    alert(`Editing "${displayName}". Make changes above and click "Add Opening" to save.`);
}

// ─── Inline Card Editing (configured screens) ──────────────────────────────

function renderInlineEditor(index) {
    const screen = screensInOrder[index];
    if (!screen || screen.phase !== 'configured') return '';

    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;
    const trackOptions = getTrackTypeOptions();
    const operatorOptions = getOperatorOptionsForTrack(screen.trackType, isGuarantee);
    const fabricOptions = getFabricOptions();
    const frameOptions = getFrameColorOptions();

    // Build accessories HTML
    const accHtml = renderInlineAccessoriesHtml(index, screen);

    return `
        <div class="inline-editor">
            <div class="ie-dimensions">
                <strong>Dimensions:</strong> ${screen.actualWidthDisplay} W × ${screen.actualHeightDisplay} H
                <a href="javascript:void(0)" onclick="remeasureScreen(${index})" style="margin-left: 10px; font-size: 0.8rem;">Re-measure</a>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Screen Name</label>
                    <input type="text" id="ie-name-${index}" value="${escapeAttr(screen.screenName || '')}">
                </div>
                <div class="form-group">
                    <label>Track Type</label>
                    <select id="ie-track-${index}" onchange="inlineTrackChanged(${index})">
                        ${buildSelectOptionsHtml(trackOptions, screen.trackType, '-- Select Track --')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Operator/Motor</label>
                    <select id="ie-operator-${index}">
                        ${buildSelectOptionsHtml(operatorOptions, screen.operatorType, '-- Select Motor --')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Fabric Color</label>
                    <select id="ie-fabric-${index}">
                        ${buildSelectOptionsHtml(fabricOptions, screen.fabricColor, '-- Select Fabric --')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Frame Color</label>
                    <select id="ie-frame-${index}">
                        ${buildSelectOptionsHtml(frameOptions, screen.frameColor, '-- Select Frame --')}
                    </select>
                </div>
                <div class="form-group" id="ie-notracks-group-${index}" style="${screen.trackType === 'sunair-zipper' ? '' : 'display:none;'}">
                    <label style="display: flex; align-items: center; gap: 6px; margin-top: 20px;">
                        <input type="checkbox" id="ie-notracks-${index}" ${screen.noTracks ? 'checked' : ''}>
                        No Tracks
                    </label>
                </div>
            </div>
            <div class="ie-accessories" id="ie-accessories-${index}">
                ${accHtml}
            </div>
            <div class="ie-actions">
                <button class="btn-primary" onclick="saveInlineEdit(${index})" style="padding: 6px 16px; font-size: 0.85rem;">Save</button>
                <button class="btn-secondary" onclick="cancelInlineEdit(${index})" style="padding: 6px 16px; font-size: 0.85rem;">Cancel</button>
            </div>
        </div>
    `;
}

function renderInlineAccessoriesHtml(index, screen) {
    const trackType = screen.trackType;
    const operatorType = screen.operatorType;

    // Determine which accessories apply
    let accList = [];
    if (operatorType && operatorType !== 'gear') {
        if (operatorType.startsWith('gaposa')) {
            accList = typeof gaposaAccessories !== 'undefined' ? gaposaAccessories : [];
        } else if (operatorType.startsWith('somfy')) {
            accList = typeof somfyAccessories !== 'undefined' ? somfyAccessories : [];
        }
    }

    if (accList.length === 0) return '<p style="font-size: 0.8rem; color: #888;">No accessories for this motor type.</p>';

    const existingNames = (screen.accessories || []).map(a => a.name);
    let html = '<label style="font-weight: 600; font-size: 0.8rem; margin-bottom: 4px; display: block;">Accessories</label>';
    accList.forEach(acc => {
        const checked = existingNames.includes(acc.name) ? 'checked' : '';
        html += `
            <label style="display: flex; align-items: center; gap: 6px; font-size: 0.85rem; padding: 2px 0;">
                <input type="checkbox" class="ie-acc-${index}" data-name="${escapeAttr(acc.name)}" data-cost="${acc.cost}" data-markup="${acc.needsMarkup ? 'true' : 'false'}" ${checked}>
                ${escapeAttr(acc.name)} (${formatCurrency(acc.cost * CUSTOMER_MARKUP)})
            </label>
        `;
    });
    return html;
}

function inlineTrackChanged(index) {
    const trackType = document.getElementById(`ie-track-${index}`).value;
    const operatorSelect = document.getElementById(`ie-operator-${index}`);
    const noTracksGroup = document.getElementById(`ie-notracks-group-${index}`);
    const isGuarantee = document.getElementById('fourWeekGuarantee').checked;

    // Update operator options
    const options = getOperatorOptionsForTrack(trackType, isGuarantee);
    operatorSelect.innerHTML = buildSelectOptionsHtml(options, '', '-- Select Motor --');

    // Toggle no-tracks visibility
    noTracksGroup.style.display = trackType === 'sunair-zipper' ? '' : 'none';
    if (trackType !== 'sunair-zipper') {
        document.getElementById(`ie-notracks-${index}`).checked = false;
    }

    // Rebuild accessories (need to update after operator change)
    const screen = screensInOrder[index];
    const accContainer = document.getElementById(`ie-accessories-${index}`);
    accContainer.innerHTML = renderInlineAccessoriesHtml(index, { ...screen, trackType, operatorType: '' });
}

function saveInlineEdit(index) {
    const screen = screensInOrder[index];

    const trackType = document.getElementById(`ie-track-${index}`).value;
    const operatorType = document.getElementById(`ie-operator-${index}`).value;
    const fabricColor = document.getElementById(`ie-fabric-${index}`).value;
    const frameColor = document.getElementById(`ie-frame-${index}`).value;

    if (!trackType || !operatorType || !fabricColor || !frameColor) {
        alert('Please fill all required fields.');
        return;
    }

    const trackTypeName = getTrackTypeName(trackType);
    const operatorTypeName = getOperatorTypeName(trackType, operatorType);
    const fabricColorName = getFabricName(fabricColor);
    const frameColorName = getFrameColorName(frameColor);
    const noTracks = document.getElementById(`ie-notracks-${index}`).checked;
    const screenName = document.getElementById(`ie-name-${index}`).value.trim();
    const guaranteeActive = document.getElementById('fourWeekGuarantee').checked;

    // Collect inline accessories
    const accessories = [];
    document.querySelectorAll(`.ie-acc-${index}:checked`).forEach(cb => {
        let accCost = parseFloat(cb.dataset.cost);
        const needsMarkup = cb.dataset.markup === 'true';
        if (needsMarkup) accCost = accCost * (1 - SUNAIR_DISCOUNT);
        accessories.push({ name: cb.dataset.name, cost: accCost, needsMarkup });
    });

    const result = computeScreenPricing({
        screenName: screenName || screen.screenName,
        trackType, trackTypeName,
        operatorType, operatorTypeName,
        fabricColor, fabricColorName,
        frameColor, frameColorName,
        width: screen.width,
        height: screen.height,
        totalWidthInches: screen.totalWidthInches,
        totalHeightInches: screen.totalHeightInches,
        actualWidthDisplay: screen.actualWidthDisplay,
        actualHeightDisplay: screen.actualHeightDisplay,
        noTracks,
        includeInstallation: screen.includeInstallation,
        wiringDistance: screen.wiringDistance,
        accessories,
        guaranteeActive,
        photos: screen.photos || [],
        pendingPhotos: screen.pendingPhotos || [],
        widthInputValue: screen.widthInputValue,
        widthFractionValue: screen.widthFractionValue,
        heightInputValue: screen.heightInputValue,
        heightFractionValue: screen.heightFractionValue
    });

    if (!result) {
        alert('Pricing failed — check dimensions against the selected track type.');
        return;
    }

    // Preserve entity IDs and exclude state
    result._openingId = screen._openingId;
    result._lineItemId = screen._lineItemId;
    result.excluded = screen.excluded;

    screensInOrder[index] = result;
    editingScreenIndex = null;
    renderScreensList();

    // Recalculate if summary is visible
    const quoteSummary = document.getElementById('quoteSummary');
    if (quoteSummary && !quoteSummary.classList.contains('hidden')) {
        calculateOrderQuote();
    }
}

function cancelInlineEdit(index) {
    editingScreenIndex = null;
    renderScreensList();
}

function remeasureScreen(index) {
    const screen = screensInOrder[index];
    if (!screen) return;

    // Reset to opening phase (keep product config for re-apply after)
    editingScreenIndex = index;

    // Populate Phase 1 form with opening's dimensions
    document.getElementById('screenName').value = screen.screenName || '';
    document.getElementById('includeInstallation').checked = screen.includeInstallation;
    document.getElementById('wiringDistance').value = screen.wiringDistance || '';
    updateWiringVisibility();

    if (screen.widthInputValue !== undefined) {
        document.getElementById('widthInches').value = screen.widthInputValue;
        document.getElementById('widthFraction').value = screen.widthFractionValue || '';
        document.getElementById('heightInches').value = screen.heightInputValue;
        document.getElementById('heightFraction').value = screen.heightFractionValue || '';
    } else {
        document.getElementById('widthInches').value = screen.width * 12;
        document.getElementById('widthFraction').value = '';
        document.getElementById('heightInches').value = screen.height * 12;
        document.getElementById('heightFraction').value = '';
    }
    updatePricingDimensions();
    checkDimensionLimits();

    existingScreenPhotos = (screen.photos || []).slice();
    pendingScreenPhotos = (screen.pendingPhotos || []).slice();
    renderPhotoPreview();

    updateAddToOrderButton();
    updatePhase1Header();
    renderScreensList();

    window.scrollTo({ top: 0, behavior: 'smooth' });
    alert(`Re-measuring "${screen.screenName || 'Screen'}". Update dimensions and click "Add Opening" to save.`);
}

function updateAddToOrderButton() {
    const addToOrderBtn = document.getElementById('addToOrderBtn');
    const addOpeningBtn = document.getElementById('addOpeningBtn');

    if (editingScreenIndex !== null) {
        const screen = screensInOrder[editingScreenIndex];
        if (screen && screen.phase === 'configured') {
            // Editing a configured screen — show "Update Screen" (full entry)
            if (addToOrderBtn) {
                addToOrderBtn.textContent = 'Update Screen';
                addToOrderBtn.style.display = '';
                addToOrderBtn.style.background = '#28a745';
            }
            if (addOpeningBtn) {
                addOpeningBtn.textContent = 'Update Opening Only';
                addOpeningBtn.style.background = '';
            }
        } else {
            // Editing an opening — show "Update Opening"
            if (addOpeningBtn) {
                addOpeningBtn.textContent = 'Update Opening';
                addOpeningBtn.style.background = '#28a745';
            }
            if (addToOrderBtn) {
                addToOrderBtn.style.display = 'none';
            }
        }
    } else {
        // Normal mode — show "Add Opening", hide "Add to Order"
        if (addOpeningBtn) {
            addOpeningBtn.textContent = 'Add Opening';
            addOpeningBtn.style.background = '';
        }
        if (addToOrderBtn) {
            addToOrderBtn.textContent = 'Add to Order';
            addToOrderBtn.style.display = 'none';
            addToOrderBtn.style.background = '';
        }
    }
}

function duplicateScreen(index) {
    const screen = JSON.parse(JSON.stringify(screensInOrder[index])); // Deep copy
    screen.screenName = screen.screenName ? `${screen.screenName} (Copy)` : null;
    screen.pendingPhotos = []; // Pending photos (Blobs) can't be deep-copied; start fresh
    screensInOrder.push(screen);
    renderScreensList();
}

function removeScreen(index) {
    if (!confirm('Are you sure you want to remove this screen?')) return;
    screensInOrder.splice(index, 1);
    renderScreensList();

    if (screensInOrder.length === 0) {
        document.getElementById('screensInOrder').classList.add('hidden');
        document.getElementById('quoteSummary').classList.add('hidden');
    }
}

// ─── Phase 2: Configuration Functions ───────────────────────────────────────

/**
 * Show/hide the Phase 2 "Configure Screens" section based on unconfigured openings.
 * Also renders the opening selector checkboxes and updates the Apply button count.
 */
function updatePhase2Visibility() {
    const phase2Section = document.getElementById('phase2Section');
    if (!phase2Section) return;

    // Show Phase 2 whenever there are any screens (configured or unconfigured)
    // Users can re-apply configuration to override existing settings
    if (screensInOrder.length > 0) {
        phase2Section.style.display = '';
        renderOpeningSelector();
    } else {
        phase2Section.style.display = 'none';
    }
}

/**
 * Render checkboxes for ALL openings in the Phase 2 selector.
 * Unconfigured openings are checked by default; configured screens are unchecked
 * but enabled so users can re-apply configuration to override existing settings.
 */
function renderOpeningSelector() {
    const listEl = document.getElementById('openingSelectorList');
    if (!listEl) return;

    let html = '';
    screensInOrder.forEach((screen, index) => {
        const isConfigured = screen.phase === 'configured';
        const name = screen.screenName || (isConfigured ? `Screen ${index + 1}` : `Opening ${index + 1}`);
        const photoCount = (screen.photos || []).length + (screen.pendingPhotos || []).length;
        const checked = isConfigured ? '' : 'checked';

        // Config summary for configured screens
        let configSummary = '';
        if (isConfigured) {
            const parts = [];
            if (screen.trackTypeName) parts.push(screen.trackTypeName.replace(' Track', ''));
            if (screen.operatorTypeName) parts.push(screen.operatorTypeName.replace(' Motor', '').replace(' Operation (Manual)', ''));
            if (screen.fabricColorName) parts.push(screen.fabricColorName);
            configSummary = parts.length > 0 ? `<span style="color: #004a95; font-size: 0.8rem;">(${parts.join(' / ')})</span>` : '';
        }

        const labelColor = isConfigured ? 'color: #004a95;' : 'color: #b8860b;';

        html += `
            <label style="display: flex; align-items: center; gap: 8px; padding: 6px 8px; cursor: pointer; border-radius: 4px;" onmouseover="this.style.background='#eee'" onmouseout="this.style.background=''">
                <input type="checkbox" class="opening-selector-cb" data-index="${index}" ${checked} onchange="updateApplyButtonCount()">
                <span style="font-weight: 600; font-size: 0.9rem; ${labelColor}">${escapeAttr(name)}</span>
                <span style="color: #666; font-size: 0.85rem;">(${screen.actualWidthDisplay} × ${screen.actualHeightDisplay})</span>
                ${configSummary}
                ${photoCount > 0 ? `<span style="color: #888; font-size: 0.8rem;">— ${photoCount} photo${photoCount !== 1 ? 's' : ''}</span>` : ''}
            </label>
        `;
    });

    listEl.innerHTML = html;
    updateApplyButtonCount();
}

/**
 * Update the "Apply to Selected (N)" button label with selected count.
 */
function updateApplyButtonCount() {
    const btn = document.getElementById('applyConfigBtn');
    if (!btn) return;
    const checkedCount = document.querySelectorAll('.opening-selector-cb:checked').length;
    btn.textContent = `Apply to Selected (${checkedCount})`;
    btn.disabled = checkedCount === 0;
}

function selectAllOpenings() {
    document.querySelectorAll('.opening-selector-cb').forEach(cb => { cb.checked = true; });
    updateApplyButtonCount();
}

function selectNoOpenings() {
    document.querySelectorAll('.opening-selector-cb').forEach(cb => { cb.checked = false; });
    updateApplyButtonCount();
}

// ─── Node.js exports (for testing) ───────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        toggleExclude,
        getApplicableProjectAccessories, renderProjectAccessories,
        toggleProjectAccessories, updateProjectAccessoryQuantity,
        renderScreensList, editScreen,
        renderInlineEditor, renderInlineAccessoriesHtml,
        inlineTrackChanged, saveInlineEdit, cancelInlineEdit, remeasureScreen,
        updateAddToOrderButton, duplicateScreen, removeScreen,
        updatePhase2Visibility, renderOpeningSelector,
        updateApplyButtonCount, selectAllOpenings, selectNoOpenings
    };
}
