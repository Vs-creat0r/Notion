/* ═══════════════════════════════════════════════════════
   Site Follow-up — Main Application JavaScript
   ═══════════════════════════════════════════════════════ */

// ── State ───────────────────────────────────────────────
let currentLocation = { lat: null, lng: null, area: '' };
let currentPhoto = null; // base64
let extractedText = '';
let isCapture = false; // true if photo was captured (not uploaded)

// ── Init ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    loadNames();
    loadEntries();

    // Camera input handler
    document.getElementById('camera-input').addEventListener('change', handleImageSelected);
    document.getElementById('upload-input').addEventListener('change', handleImageSelected);

    // Enter key on name input
    document.getElementById('new-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addName();
    });
});

// ── Toast Notifications ─────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

// ── Loading ─────────────────────────────────────────────
function showLoading(text = 'Processing...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

// ── Tab Switching (Mobile) ──────────────────────────────
function switchTab(tab) {
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    document.getElementById('capture-section').classList.toggle('active', tab === 'capture');
    document.getElementById('entries-section').classList.toggle('active', tab === 'entries');
}

// ── Photo Capture ───────────────────────────────────────
function capturePhoto() {
    isCapture = true;
    document.getElementById('camera-input').click();
}

function uploadPhoto() {
    isCapture = false;
    document.getElementById('upload-input').click();
}

function handleImageSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        currentPhoto = e.target.result;
        showPreview(e.target.result);

        // If captured photo → fetch location
        if (isCapture) {
            fetchLocation();
        } else {
            // If uploaded → run OCR
            document.getElementById('location-info').innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>Location: N/A (uploaded photo)</span>
            `;
            runOCR(e.target.result);
        }
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    event.target.value = '';
}

function showPreview(imageSrc) {
    document.getElementById('preview-image').src = imageSrc;
    document.getElementById('preview-section').classList.remove('hidden');
}

function clearPreview() {
    document.getElementById('preview-section').classList.add('hidden');
    document.getElementById('preview-image').src = '';
    document.getElementById('ocr-info').classList.add('hidden');
    currentPhoto = null;
    extractedText = '';
    currentLocation = { lat: null, lng: null, area: '' };
}

// ── Geolocation ─────────────────────────────────────────
function fetchLocation() {
    const locationInfo = document.getElementById('location-info');
    locationInfo.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span class="pulsing">Fetching location...</span>
    `;

    if (!navigator.geolocation) {
        locationInfo.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>Geolocation not supported</span>
        `;
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            currentLocation.lat = position.coords.latitude;
            currentLocation.lng = position.coords.longitude;
            reverseGeocode(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
            console.error('Geolocation error:', error);
            locationInfo.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <span>Location access denied</span>
            `;
            showToast('Could not access location. Please enable GPS.', 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 0
        }
    );
}

async function reverseGeocode(lat, lng) {
    const locationInfo = document.getElementById('location-info');
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
            { headers: { 'Accept-Language': 'en' } }
        );
        const data = await response.json();

        const addr = data.address || {};
        const parts = [];
        if (addr.road) parts.push(addr.road);
        if (addr.neighbourhood) parts.push(addr.neighbourhood);
        if (addr.suburb) parts.push(addr.suburb);
        if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
        if (addr.state) parts.push(addr.state);

        currentLocation.area = parts.join(', ') || data.display_name || `${lat}, ${lng}`;

        locationInfo.classList.add('location-found');
        locationInfo.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${currentLocation.area}</span>
        `;
    } catch (err) {
        console.error('Reverse geocode error:', err);
        currentLocation.area = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        locationInfo.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <span>${currentLocation.area}</span>
        `;
    }

    // Also run OCR after getting location
    if (currentPhoto) {
        runOCR(currentPhoto);
    }
}

// ── OCR (Tesseract.js) ──────────────────────────────────
async function runOCR(imageData) {
    const ocrInfo = document.getElementById('ocr-info');
    ocrInfo.classList.remove('hidden');
    ocrInfo.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
        <span class="pulsing">Extracting text (OCR)...</span>
    `;

    try {
        const result = await Tesseract.recognize(imageData, 'eng', {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    ocrInfo.querySelector('span').textContent = `Extracting text... ${pct}%`;
                }
            }
        });

        extractedText = result.data.text.trim();

        if (extractedText) {
            ocrInfo.classList.add('ocr-found');
            const preview = extractedText.length > 60 ? extractedText.substring(0, 60) + '...' : extractedText;
            ocrInfo.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span>Text found: "${preview}"</span>
            `;
        } else {
            ocrInfo.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span>No text found in image</span>
            `;
        }
    } catch (err) {
        console.error('OCR error:', err);
        ocrInfo.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>OCR processing failed</span>
        `;
    }
}

// ── Submit Entry ────────────────────────────────────────
async function submitEntry() {
    const nameSelect = document.getElementById('name-select');
    const name = nameSelect.value;

    if (!name) {
        showToast('Please select an engineer name', 'error');
        return;
    }

    if (!currentPhoto) {
        showToast('Please capture or upload a photo first', 'error');
        return;
    }

    showLoading('Saving entry...');

    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const date = now.toISOString().split('T')[0];

    try {
        const response = await fetch('/api/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                photo: currentPhoto,
                latitude: currentLocation.lat || 0,
                longitude: currentLocation.lng || 0,
                area_name: currentLocation.area || '',
                extracted_text: extractedText || '',
                timestamp: timestamp,
                date: date
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to save entry');
        }

        showToast('Entry saved successfully!', 'success');
        clearPreview();
        loadEntries();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ── Load Entries ────────────────────────────────────────
async function loadEntries() {
    try {
        const response = await fetch('/api/entries');
        const entries = await response.json();

        const container = document.getElementById('entries-list');
        document.getElementById('entry-count').textContent = entries.length;

        if (entries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.3">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                        <line x1="3" y1="9" x2="21" y2="9"/>
                        <line x1="9" y1="21" x2="9" y2="9"/>
                    </svg>
                    <p>No entries yet. Capture or upload a photo to get started!</p>
                </div>
            `;
            return;
        }

        // Group by date
        const grouped = {};
        entries.forEach(entry => {
            if (!grouped[entry.date]) grouped[entry.date] = [];
            grouped[entry.date].push(entry);
        });

        let html = '';
        for (const [date, dateEntries] of Object.entries(grouped)) {
            html += `<div class="date-header">📅 Date: ${date}</div>`;
            dateEntries.forEach(entry => {
                const location = entry.area_name || `${entry.location_lat}, ${entry.location_lng}`;
                const hasText = entry.extracted_text && entry.extracted_text.trim();
                html += `
                    <div class="entry-item">
                        <div class="entry-thumb" onclick="viewPhoto('${entry.photo_filename}', ${JSON.stringify(entry.extracted_text || '').replace(/'/g, "\\'")})">
                            <img src="/uploads/${entry.photo_filename}" alt="Photo" loading="lazy">
                        </div>
                        <div class="entry-details">
                            <div class="entry-name">${escapeHtml(entry.name)}</div>
                            <div class="entry-meta">
                                <span>🕐 ${entry.timestamp}</span>
                                <span>📍 ${escapeHtml(location)}</span>
                                ${hasText ? `<span>📄 Text extracted</span>` : ''}
                            </div>
                        </div>
                        <div class="entry-actions">
                            <button class="btn-danger-sm" onclick="deleteEntry(${entry.id})">Delete</button>
                        </div>
                    </div>
                `;
            });
        }

        container.innerHTML = html;
    } catch (err) {
        console.error('Failed to load entries:', err);
    }
}

// ── Delete Entry ────────────────────────────────────────
async function deleteEntry(id) {
    if (!confirm('Delete this entry?')) return;

    try {
        await fetch(`/api/entries/${id}`, { method: 'DELETE' });
        showToast('Entry deleted', 'info');
        loadEntries();
    } catch (err) {
        showToast('Failed to delete entry', 'error');
    }
}

// ── View Photo ──────────────────────────────────────────
function viewPhoto(filename, extractedText) {
    const modal = document.getElementById('photo-modal');
    const img = document.getElementById('photo-modal-image');
    const textDiv = document.getElementById('photo-modal-text');

    img.src = `/uploads/${filename}`;

    if (extractedText && extractedText.trim()) {
        textDiv.classList.remove('hidden');
        textDiv.innerHTML = `<h4>📄 Extracted Text</h4><p>${escapeHtml(extractedText)}</p>`;
    } else {
        textDiv.classList.add('hidden');
    }

    modal.classList.remove('hidden');
}

function closePhotoModal() {
    document.getElementById('photo-modal').classList.add('hidden');
}

// ── Name CRUD ───────────────────────────────────────────
function showNameModal() {
    document.getElementById('name-modal').classList.remove('hidden');
    loadNamesList();
}

function closeNameModal() {
    document.getElementById('name-modal').classList.add('hidden');
}

async function loadNames() {
    try {
        const response = await fetch('/api/names');
        const names = await response.json();

        const select = document.getElementById('name-select');
        const currentVal = select.value;
        select.innerHTML = '<option value="">Select Engineer...</option>';
        names.forEach(n => {
            const option = document.createElement('option');
            option.value = n.name;
            option.textContent = n.name;
            select.appendChild(option);
        });
        if (currentVal) select.value = currentVal;
    } catch (err) {
        console.error('Failed to load names:', err);
    }
}

async function loadNamesList() {
    try {
        const response = await fetch('/api/names');
        const names = await response.json();

        const container = document.getElementById('names-list');

        if (names.length === 0) {
            container.innerHTML = '<div class="empty-state-small">No engineers added yet</div>';
            return;
        }

        container.innerHTML = names.map(n => `
            <div class="name-item" id="name-item-${n.id}">
                <span class="name-item-name">${escapeHtml(n.name)}</span>
                <div class="name-item-actions">
                    <button class="btn-edit-sm" onclick="editName(${n.id}, '${escapeHtml(n.name).replace(/'/g, "\\'")}')">Edit</button>
                    <button class="btn-danger-sm" onclick="deleteName(${n.id})">Delete</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load names list:', err);
    }
}

async function addName() {
    const input = document.getElementById('new-name-input');
    const name = input.value.trim();

    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }

    try {
        const response = await fetch('/api/names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });

        if (response.status === 409) {
            showToast('Name already exists', 'error');
            return;
        }

        if (!response.ok) throw new Error('Failed to add name');

        input.value = '';
        showToast(`${name} added!`, 'success');
        loadNames();
        loadNamesList();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function editName(id, currentName) {
    const newName = prompt('Edit engineer name:', currentName);
    if (!newName || newName.trim() === currentName) return;

    try {
        const response = await fetch(`/api/names/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: newName.trim() })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Failed to update name');
        }

        showToast('Name updated!', 'success');
        loadNames();
        loadNamesList();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteName(id) {
    if (!confirm('Delete this engineer?')) return;

    try {
        await fetch(`/api/names/${id}`, { method: 'DELETE' });
        showToast('Engineer removed', 'info');
        loadNames();
        loadNamesList();
    } catch (err) {
        showToast('Failed to delete', 'error');
    }
}

// ── Export Excel ────────────────────────────────────────
async function exportExcel() {
    showLoading('Generating Excel...');
    try {
        const response = await fetch('/api/export');
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Export failed');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Site_Followup_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Excel exported successfully!', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ── Utility ────────────────────────────────────────────
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
