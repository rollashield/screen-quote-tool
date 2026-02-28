/**
 * photo-manager.js
 * Photo compression, upload, preview, and deletion for site photos.
 *
 * Dependencies:
 *   - pricing-data.js must be loaded first (provides MAX_PHOTOS_PER_SCREEN)
 *   - DOM elements from index.html must exist
 *
 * Global state used (declared elsewhere):
 *   - pendingScreenPhotos: Array of blobs awaiting upload
 *   - existingScreenPhotos: Array of R2 photo metadata objects
 *   - editingScreenIndex: Index of screen being edited, or null
 *   - currentQuoteId: Active quote's DB ID
 *   - screensInOrder: Array of screen objects
 *   - WORKER_URL: Worker base URL (from index.html)
 *
 * Extracted from app.js in Step 2 refactoring.
 */

// ─── Photo Compression ────────────────────────────────────────────────────────

/**
 * Compress a photo file client-side using canvas.
 * Resizes to max 2048px on longest edge, exports as JPEG at 0.75 quality.
 * Returns a Promise<Blob>.
 */
function compressPhoto(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const maxDim = 2048;
            let w = img.width;
            let h = img.height;
            if (w > maxDim || h > maxDim) {
                if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
                else { w = Math.round(w * maxDim / h); h = maxDim; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => {
                if (blob) resolve(blob);
                else reject(new Error('Failed to compress photo'));
            }, 'image/jpeg', 0.75);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
        img.src = url;
    });
}

// ─── Photo Selection & Preview ────────────────────────────────────────────────

async function handlePhotoSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const totalCurrent = pendingScreenPhotos.length + existingScreenPhotos.length;
    const remaining = MAX_PHOTOS_PER_SCREEN - totalCurrent;

    if (remaining <= 0) {
        alert(`Maximum ${MAX_PHOTOS_PER_SCREEN} photos per screen.`);
        event.target.value = '';
        return;
    }

    const toProcess = files.slice(0, remaining);
    if (toProcess.length < files.length) {
        alert(`Only adding ${toProcess.length} of ${files.length} photos (limit: ${MAX_PHOTOS_PER_SCREEN}).`);
    }

    for (const file of toProcess) {
        try {
            const compressed = await compressPhoto(file);
            compressed._originalName = file.name;
            pendingScreenPhotos.push(compressed);
        } catch (err) {
            console.error('Photo compression failed:', err);
        }
    }

    event.target.value = '';
    renderPhotoPreview();

    // Auto-save if editing an existing opening with entity ID
    if (editingScreenIndex !== null && currentQuoteId) {
        // Sync pending photos to the screen object before auto-save
        screensInOrder[editingScreenIndex].pendingPhotos = pendingScreenPhotos.slice();
        screensInOrder[editingScreenIndex].photos = existingScreenPhotos.slice();
        debouncedAutoSaveOpening(editingScreenIndex);
    }
}

function renderPhotoPreview() {
    const grid = document.getElementById('photoGrid');
    const countEl = document.getElementById('photoCount');
    const addLabel = document.getElementById('photoAddLabel');
    const total = pendingScreenPhotos.length + existingScreenPhotos.length;
    countEl.textContent = `(${total}/${MAX_PHOTOS_PER_SCREEN})`;

    let html = '';

    // Existing (already uploaded) photos
    existingScreenPhotos.forEach((photo, i) => {
        const thumbUrl = photo.url || photo.key;
        html += `<div class="photo-thumb">
            <img src="${thumbUrl}" alt="${photo.filename || 'Photo'}">
            <button class="photo-remove" onclick="removeExistingPhoto(${i})" title="Remove">&times;</button>
        </div>`;
    });

    // Pending (not yet uploaded) photos
    pendingScreenPhotos.forEach((blob, i) => {
        const objectUrl = URL.createObjectURL(blob);
        html += `<div class="photo-thumb">
            <img src="${objectUrl}" alt="${blob._originalName || 'Photo'}">
            <button class="photo-remove" onclick="removePendingPhoto(${i})" title="Remove">&times;</button>
        </div>`;
    });

    grid.innerHTML = html;
    addLabel.style.display = total >= MAX_PHOTOS_PER_SCREEN ? 'none' : '';
}

function removePendingPhoto(index) {
    pendingScreenPhotos.splice(index, 1);
    renderPhotoPreview();
}

function removeExistingPhoto(index) {
    const removed = existingScreenPhotos.splice(index, 1)[0];
    if (removed && removed.key) {
        // Track for deletion when quote is saved
        window._photosToDelete = window._photosToDelete || [];
        window._photosToDelete.push(removed.key);
    }
    renderPhotoPreview();
}

// ─── Photo Upload & Deletion (R2) ────────────────────────────────────────────

/**
 * Upload all pending photos for a screen to R2.
 * Returns array of photo metadata objects.
 */
async function uploadPendingPhotos(quoteId, screenIndex, pendingPhotos) {
    const uploaded = [];
    for (const blob of pendingPhotos) {
        const formData = new FormData();
        formData.append('photo', blob, blob._originalName || 'photo.jpg');
        formData.append('quoteId', quoteId);
        formData.append('screenIndex', String(screenIndex));

        try {
            const response = await fetch(`${WORKER_URL}/api/photos/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if (result.success && result.photo) {
                uploaded.push({
                    key: result.photo.key,
                    url: `${WORKER_URL}/r2/${result.photo.key}`,
                    filename: result.photo.filename,
                    size: result.photo.size,
                    contentType: result.photo.contentType,
                    uploadedAt: new Date().toISOString(),
                    category: 'site'
                });
            }
        } catch (err) {
            console.error('Photo upload failed:', err);
        }
    }
    return uploaded;
}

/**
 * Delete photos from R2 that were marked for deletion.
 */
async function deleteMarkedPhotos() {
    const toDelete = window._photosToDelete || [];
    for (const key of toDelete) {
        try {
            await fetch(`${WORKER_URL}/api/photos/delete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key })
            });
        } catch (err) {
            console.error('Photo delete failed:', err);
        }
    }
    window._photosToDelete = [];
}

// ─── Node.js exports (for testing) ───────────────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        compressPhoto, handlePhotoSelect, renderPhotoPreview,
        removePendingPhoto, removeExistingPhoto,
        uploadPendingPhotos, deleteMarkedPhotos
    };
}
