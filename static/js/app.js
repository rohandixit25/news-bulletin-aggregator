/**
 * News Bulletin Aggregator — Unified App
 * Merges player, sources, and settings into a single-page tabbed app.
 */

// ==================== STATE ====================
let currentProfileId = null;
let profiles = {};
let deviceId = null;
let bulletinData = null;
let bulletinChapters = [];
let currentEmailFilename = null;

// Player state
const playbackSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let currentSpeedIndex = 1;
let preferredSpeed = parseFloat(localStorage.getItem('preferredSpeed') || '1.0');

// ==================== HELPERS ====================
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    const isSecure = location.protocol === 'https:' ? ';Secure' : '';
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax${isSecure}`;
}

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? match[2] : null;
}

function getDeviceId() {
    let id = getCookie('deviceId');
    if (!id) {
        id = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        setCookie('deviceId', id, 365);
    }
    return id;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const today = new Date();
        if (date.toDateString() === today.toDateString()) return 'Today';
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch (e) { return dateString; }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const pad = n => n.toString().padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

// ==================== 1. TAB NAVIGATION ====================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const tab = document.getElementById('tab-' + tabId);
    if (tab) tab.classList.add('active');
    const btn = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    if (btn) btn.classList.add('active');

    // Trigger data loads on tab switch
    if (tabId === 'sources') {
        checkStaleness();
    } else if (tabId === 'settings') {
        loadRecentFiles();
        loadStorageInfo();
        loadSchedule();
    }
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ==================== 2. PLAYER ====================
const audio = document.getElementById('audio');
const playPauseBtn = document.getElementById('play-pause');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const skipBackBtn = document.getElementById('skip-back');
const skipForwardBtn = document.getElementById('skip-forward');
const speedControl = document.getElementById('speed-control');
const speedLabel = document.getElementById('speed-label');
const downloadBtn = document.getElementById('download-btn');
const progressFill = document.getElementById('progress-fill');
const progressSlider = document.getElementById('progress-slider');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');

async function loadLatestBulletin() {
    const loading = document.getElementById('player-loading');
    const error = document.getElementById('player-error');
    const section = document.getElementById('player-section');

    loading.style.display = 'flex';
    error.style.display = 'none';
    section.style.display = 'none';

    try {
        const res = await fetch('/api/latest-bulletin');
        if (!res.ok) throw new Error('No bulletin available');
        bulletinData = await res.json();

        document.getElementById('bulletin-title').textContent = "Today's News Bulletin";
        document.getElementById('bulletin-profile').textContent = bulletinData.profile_name || 'News';
        document.getElementById('bulletin-date').textContent = formatDate(bulletinData.date);

        audio.src = `/api/download/${bulletinData.filename}`;

        // Load metadata for chapters
        loadBulletinChapters(bulletinData.filename);
    } catch (err) {
        loading.style.display = 'none';
        error.style.display = 'flex';
        document.getElementById('player-error-message').textContent =
            err.message || 'Unable to load bulletin';
    }
}

async function loadBulletinChapters(filename) {
    try {
        const res = await fetch(`/api/bulletin/${filename}/metadata`);
        if (res.ok) {
            const meta = await res.json();
            bulletinChapters = meta.chapters || [];
        }
    } catch { bulletinChapters = []; }
}

function renderChapterMarkers() {
    const markersEl = document.getElementById('chapter-markers');
    const listEl = document.getElementById('chapter-list');
    markersEl.innerHTML = '';

    if (!bulletinChapters.length || !audio.duration) {
        listEl.style.display = 'none';
        return;
    }

    const totalMs = audio.duration * 1000;

    // Tick marks on progress bar
    bulletinChapters.forEach(ch => {
        if (ch.start_ms > 0) {
            const tick = document.createElement('div');
            tick.className = 'chapter-tick';
            tick.style.left = `${(ch.start_ms / totalMs) * 100}%`;
            markersEl.appendChild(tick);
        }
    });

    // Chapter list below player
    listEl.style.display = 'block';
    listEl.innerHTML = bulletinChapters.map((ch, i) => `
        <div class="chapter-item" data-index="${i}" data-start="${ch.start_ms}">
            <span>${ch.name}</span>
            <span class="chapter-time">${formatTime(ch.start_ms / 1000)}</span>
        </div>
    `).join('');

    listEl.querySelectorAll('.chapter-item').forEach(item => {
        item.addEventListener('click', () => {
            const startMs = parseInt(item.dataset.start);
            audio.currentTime = startMs / 1000;
            if (audio.paused) audio.play();
        });
    });
}

function updateNowPlaying() {
    const nowPlaying = document.getElementById('now-playing');
    const sourceEl = document.getElementById('now-playing-source');

    if (!bulletinChapters.length) {
        nowPlaying.style.display = 'none';
        return;
    }

    const currentMs = audio.currentTime * 1000;
    let currentChapter = bulletinChapters[0];

    for (const ch of bulletinChapters) {
        if (currentMs >= ch.start_ms) {
            currentChapter = ch;
        }
    }

    if (currentChapter) {
        nowPlaying.style.display = 'block';
        sourceEl.textContent = currentChapter.name;

        // Highlight active chapter in list
        document.querySelectorAll('.chapter-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.start) === currentChapter.start_ms);
        });
    }
}

// Audio event listeners
audio.addEventListener('loadedmetadata', () => {
    document.getElementById('player-loading').style.display = 'none';
    document.getElementById('player-section').style.display = 'flex';

    durationEl.textContent = formatTime(audio.duration);
    progressSlider.max = audio.duration;

    audio.playbackRate = preferredSpeed;
    currentSpeedIndex = playbackSpeeds.indexOf(preferredSpeed);
    if (currentSpeedIndex === -1) currentSpeedIndex = 1;
    speedLabel.textContent = `${preferredSpeed}x`;

    setupMediaSession();
    restorePlaybackPosition();
    renderChapterMarkers();
});

audio.addEventListener('error', () => {
    document.getElementById('player-loading').style.display = 'none';
    document.getElementById('player-error').style.display = 'flex';
    document.getElementById('player-error-message').textContent = 'Failed to load audio file';
});

audio.addEventListener('timeupdate', () => {
    if (isNaN(audio.duration)) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressFill.style.width = `${pct}%`;
    progressSlider.value = audio.currentTime;
    currentTimeEl.textContent = formatTime(audio.currentTime);
    updateNowPlaying();
    updateMediaSessionState();
    savePlaybackPosition();
});

audio.addEventListener('play', updatePlayPauseIcon);
audio.addEventListener('pause', updatePlayPauseIcon);
audio.addEventListener('ended', () => {
    updatePlayPauseIcon();
    showSpeedPresetPrompt();
});

function updatePlayPauseIcon() {
    playIcon.style.display = audio.paused ? 'block' : 'none';
    pauseIcon.style.display = audio.paused ? 'none' : 'block';
}

playPauseBtn.addEventListener('click', () => {
    audio.paused ? audio.play() : audio.pause();
});

skipBackBtn.addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 15);
});

skipForwardBtn.addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15);
});

speedControl.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
    const speed = playbackSpeeds[currentSpeedIndex];
    audio.playbackRate = speed;
    speedLabel.textContent = `${speed}x`;
    preferredSpeed = speed;
    localStorage.setItem('preferredSpeed', speed.toString());
});

progressSlider.addEventListener('input', e => {
    const t = parseFloat(e.target.value);
    audio.currentTime = t;
    progressFill.style.width = `${(t / audio.duration) * 100}%`;
    currentTimeEl.textContent = formatTime(t);
});

downloadBtn.addEventListener('click', () => {
    if (bulletinData?.filename) {
        const a = document.createElement('a');
        a.href = `/api/download/${bulletinData.filename}`;
        a.download = bulletinData.filename;
        a.click();
    }
});

// Media Session API
function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
        title: "Today's News Bulletin",
        artist: bulletinData?.profile_name || 'News Bulletin',
        album: 'Daily News',
        artwork: [
            { src: '/static/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
            { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
    });

    navigator.mediaSession.setActionHandler('play', () => { audio.play(); });
    navigator.mediaSession.setActionHandler('pause', () => { audio.pause(); });
    navigator.mediaSession.setActionHandler('seekbackward', d => {
        audio.currentTime = Math.max(0, audio.currentTime - (d.seekOffset || 15));
    });
    navigator.mediaSession.setActionHandler('seekforward', d => {
        audio.currentTime = Math.min(audio.duration, audio.currentTime + (d.seekOffset || 15));
    });
    navigator.mediaSession.setActionHandler('seekto', d => {
        audio.currentTime = d.seekTime;
    });
}

function updateMediaSessionState() {
    if (!('mediaSession' in navigator) || !audio.duration) return;
    navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';
    try {
        navigator.mediaSession.setPositionState({
            duration: audio.duration,
            playbackRate: audio.playbackRate,
            position: audio.currentTime
        });
    } catch (e) { console.warn(e); }
}

// Playback position persistence
function savePlaybackPosition() {
    if (bulletinData && audio.currentTime > 0 && audio.currentTime < audio.duration - 5) {
        localStorage.setItem('lastBulletinFile', bulletinData.filename);
        localStorage.setItem('lastPlaybackPosition', audio.currentTime.toString());
        localStorage.setItem('lastPlaybackTime', Date.now().toString());
    }
}

function restorePlaybackPosition() {
    try {
        const savedFile = localStorage.getItem('lastBulletinFile');
        const savedPos = parseFloat(localStorage.getItem('lastPlaybackPosition') || '0');
        const savedTime = parseInt(localStorage.getItem('lastPlaybackTime') || '0');

        if (savedFile === bulletinData?.filename && savedPos > 5 &&
            savedPos < audio.duration - 5 && Date.now() - savedTime < 86400000) {
            audio.currentTime = savedPos;
            showToast(`Resuming from ${formatTime(savedPos)}`);
        }
    } catch (e) { console.warn(e); }
}

// Wake Lock
if ('wakeLock' in navigator) {
    let wakeLock = null;
    audio.addEventListener('play', async () => {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* expected on unsupported browsers */ }
    });
    audio.addEventListener('pause', () => {
        if (wakeLock) { wakeLock.release(); wakeLock = null; }
    });
}

// Speed preset prompt
function showSpeedPresetPrompt() {
    if (localStorage.getItem('hasSeenSpeedPrompt')) return;
    const modal = document.getElementById('speed-preset-modal');
    modal.style.display = 'flex';
}

document.querySelectorAll('.speed-option').forEach(btn => {
    btn.addEventListener('click', () => {
        const speed = parseFloat(btn.dataset.speed);
        preferredSpeed = speed;
        localStorage.setItem('preferredSpeed', speed.toString());
        audio.playbackRate = speed;
        speedLabel.textContent = `${speed}x`;
        currentSpeedIndex = playbackSpeeds.indexOf(speed);
        if (currentSpeedIndex === -1) currentSpeedIndex = 1;
        document.getElementById('speed-preset-modal').style.display = 'none';
        localStorage.setItem('hasSeenSpeedPrompt', 'true');
        showToast(`Default speed set to ${speed}x`);
    });
});

document.getElementById('skip-speed-preset')?.addEventListener('click', () => {
    document.getElementById('speed-preset-modal').style.display = 'none';
    localStorage.setItem('hasSeenSpeedPrompt', 'true');
});

// ==================== 3. SOURCES ====================
async function loadProfiles() {
    try {
        const deviceRes = await fetch(`/api/device/${deviceId}/profile`);
        const deviceData = await deviceRes.json();
        const linkedProfileId = deviceData.profile_id;

        const res = await fetch('/api/profiles');
        const data = await res.json();
        profiles = data.profiles;

        if (linkedProfileId && profiles[linkedProfileId]) {
            currentProfileId = linkedProfileId;
            await fetch(`/api/profiles/${linkedProfileId}/switch`, { method: 'POST' });
        } else {
            currentProfileId = data.active_profile;
        }
    } catch (err) {
        console.error('Error loading profiles:', err);
    }
}

function renderProfileSelector() {
    const sel = document.getElementById('profile-selector');
    sel.innerHTML = Object.entries(profiles).map(([id, p]) =>
        `<option value="${id}" ${id === currentProfileId ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    document.getElementById('settings-profile-name').textContent =
        profiles[currentProfileId]?.name || '--';

    // Disable delete for default
    const delBtn = document.getElementById('delete-profile-btn');
    if (delBtn) delBtn.disabled = currentProfileId === 'default';
}

function renderSources() {
    const list = document.getElementById('sources-list');
    const profile = profiles[currentProfileId];
    if (!profile) return;

    const sources = profile.sources || {};
    // Sort by order
    const sorted = Object.entries(sources).sort((a, b) =>
        (a[1].order ?? 999) - (b[1].order ?? 999)
    );

    if (!sorted.length) {
        list.innerHTML = '<p class="muted-text" style="text-align:center;padding:24px;">No sources configured</p>';
        return;
    }

    list.innerHTML = sorted.map(([name, data]) => `
        <div class="source-item" draggable="true" data-source="${name}">
            <div class="drag-handle" title="Drag to reorder">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/>
                    <circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/>
                    <circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/>
                </svg>
            </div>
            <div class="source-info">
                <div class="source-name">
                    ${name}
                    ${data.custom ? '<span class="custom-badge">Custom</span>' : ''}
                </div>
                <div class="source-description">${data.description || ''}</div>
            </div>
            <span class="staleness-badge" id="stale-${name.replace(/[^a-zA-Z0-9]/g, '_')}" style="display:none;"></span>
            <label class="toggle-label">
                <input type="checkbox" class="toggle-input source-toggle" data-source="${name}" ${data.enabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
            </label>
            ${data.custom ? `<button class="btn-delete-source" data-source="${name}">×</button>` : ''}
        </div>
    `).join('');

    // Source toggle change handlers
    list.querySelectorAll('.source-toggle').forEach(toggle => {
        toggle.addEventListener('change', () => saveSourceToggles());
    });

    // Delete source handlers
    list.querySelectorAll('.btn-delete-source').forEach(btn => {
        btn.addEventListener('click', () => deleteCustomSource(btn.dataset.source));
    });

    setupDragAndDrop();
}

async function saveSourceToggles() {
    const sources = { ...profiles[currentProfileId].sources };
    document.querySelectorAll('.source-toggle').forEach(toggle => {
        const name = toggle.dataset.source;
        if (sources[name]) sources[name].enabled = toggle.checked;
    });

    try {
        await fetch(`/api/profiles/${currentProfileId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sources })
        });
        profiles[currentProfileId].sources = sources;
    } catch (err) {
        showToast('Failed to save');
    }
}

// Drag and Drop (HTML5 + touch fallback)
function setupDragAndDrop() {
    const list = document.getElementById('sources-list');
    let draggedEl = null;

    // HTML5 DnD for desktop
    list.querySelectorAll('.source-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            draggedEl = item;
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.source);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            list.querySelectorAll('.source-item').forEach(el => el.classList.remove('drag-over'));
            draggedEl = null;
        });

        item.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedEl && draggedEl !== item) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', e => {
            e.preventDefault();
            item.classList.remove('drag-over');
            if (draggedEl && draggedEl !== item) {
                const items = [...list.querySelectorAll('.source-item')];
                const fromIdx = items.indexOf(draggedEl);
                const toIdx = items.indexOf(item);
                if (fromIdx < toIdx) {
                    item.after(draggedEl);
                } else {
                    item.before(draggedEl);
                }
                saveSourceOrder();
            }
        });
    });

    // Touch fallback for iOS Safari
    let touchDragEl = null;
    let touchClone = null;
    let touchStartY = 0;

    list.querySelectorAll('.drag-handle').forEach(handle => {
        handle.addEventListener('touchstart', e => {
            touchDragEl = handle.closest('.source-item');
            if (!touchDragEl) return;
            touchStartY = e.touches[0].clientY;
            touchDragEl.classList.add('dragging');

            // Create visual clone
            touchClone = touchDragEl.cloneNode(true);
            touchClone.style.cssText = `position:fixed;z-index:9999;pointer-events:none;opacity:0.8;width:${touchDragEl.offsetWidth}px;left:${touchDragEl.getBoundingClientRect().left}px;top:${touchDragEl.getBoundingClientRect().top}px;`;
            document.body.appendChild(touchClone);
        }, { passive: true });

        handle.addEventListener('touchmove', e => {
            if (!touchDragEl || !touchClone) return;
            e.preventDefault();
            const touch = e.touches[0];
            touchClone.style.top = `${touch.clientY - 30}px`;

            // Find target element under touch point
            touchClone.style.display = 'none';
            const target = document.elementFromPoint(touch.clientX, touch.clientY);
            touchClone.style.display = '';

            list.querySelectorAll('.source-item').forEach(el => el.classList.remove('drag-over'));
            const targetItem = target?.closest('.source-item');
            if (targetItem && targetItem !== touchDragEl) {
                targetItem.classList.add('drag-over');
            }
        }, { passive: false });

        handle.addEventListener('touchend', () => {
            if (!touchDragEl) return;

            const overItem = list.querySelector('.source-item.drag-over');
            if (overItem && overItem !== touchDragEl) {
                const items = [...list.querySelectorAll('.source-item')];
                const fromIdx = items.indexOf(touchDragEl);
                const toIdx = items.indexOf(overItem);
                if (fromIdx < toIdx) {
                    overItem.after(touchDragEl);
                } else {
                    overItem.before(touchDragEl);
                }
                saveSourceOrder();
            }

            touchDragEl.classList.remove('dragging');
            list.querySelectorAll('.source-item').forEach(el => el.classList.remove('drag-over'));
            if (touchClone) { touchClone.remove(); touchClone = null; }
            touchDragEl = null;
        });
    });
}

async function saveSourceOrder() {
    const items = document.querySelectorAll('#sources-list .source-item');
    const order = [...items].map(el => el.dataset.source);

    try {
        await fetch(`/api/profiles/${currentProfileId}/sources/reorder`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order })
        });

        // Update local state
        order.forEach((name, idx) => {
            if (profiles[currentProfileId]?.sources?.[name]) {
                profiles[currentProfileId].sources[name].order = idx;
            }
        });
    } catch (e) { console.warn(e); }
}

// Staleness checking
async function checkStaleness() {
    if (!currentProfileId) return;
    try {
        const res = await fetch(`/api/profiles/${currentProfileId}/staleness`);
        if (!res.ok) return;
        const data = await res.json();

        Object.entries(data.staleness || {}).forEach(([name, info]) => {
            const id = 'stale-' + name.replace(/[^a-zA-Z0-9]/g, '_');
            const badge = document.getElementById(id);
            if (!badge) return;

            badge.style.display = 'inline-block';
            if (info.stale) {
                badge.className = 'staleness-badge stale';
                badge.textContent = info.age_hours ? `Stale (${Math.round(info.age_hours)}h ago)` : 'Stale';
            } else {
                badge.className = 'staleness-badge fresh';
                badge.textContent = info.age_hours ? `${Math.round(info.age_hours)}h ago` : 'OK';
            }
        });
    } catch (e) { console.warn(e); }
}

// Profile selector change
document.getElementById('profile-selector').addEventListener('change', async e => {
    const newId = e.target.value;
    if (newId === currentProfileId) return;
    try {
        await fetch(`/api/profiles/${newId}/switch`, { method: 'POST' });
        await fetch(`/api/device/${deviceId}/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: newId })
        });
        currentProfileId = newId;
        renderProfileSelector();
        renderSources();
        showToast(`Switched to ${profiles[newId].name}`);
    } catch {
        showToast('Failed to switch profile');
    }
});

// Generate bulletin via SSE
document.getElementById('generate-btn').addEventListener('click', () => {
    const btn = document.getElementById('generate-btn');
    btn.disabled = true;
    btn.querySelector('.btn-text').style.display = 'none';
    btn.querySelector('.btn-spinner').style.display = 'inline-flex';

    const progressContainer = document.getElementById('generation-progress');
    const log = document.getElementById('progress-log');
    progressContainer.style.display = 'block';
    log.innerHTML = '';

    const es = new EventSource('/api/generate/stream');

    es.onmessage = event => {
        try {
            const data = JSON.parse(event.data);
            let icon = '', cls = '';
            switch (data.stage) {
                case 'downloading': icon = '📥'; cls = 'progress-downloading'; break;
                case 'processing': icon = '⚙️'; cls = 'progress-processing'; break;
                case 'complete': icon = '✅'; cls = 'progress-complete'; break;
                case 'warning': icon = '⚠️'; cls = 'progress-warning'; break;
                case 'error': icon = '❌'; cls = 'progress-error'; break;
            }

            const entry = document.createElement('div');
            entry.className = `progress-entry ${cls}`;
            entry.innerHTML = `<span class="progress-icon">${icon}</span><span>${data.message}</span>`;
            log.appendChild(entry);
            log.scrollTop = log.scrollHeight;

            if (data.stage === 'complete') {
                es.close();
                resetGenerateBtn(btn);
                showToast('Bulletin generated!');
                loadLatestBulletin();
            }

            if (data.stage === 'error') {
                es.close();
                resetGenerateBtn(btn);
            }
        } catch (e) { console.warn(e); }
    };

    es.onerror = () => {
        es.close();
        resetGenerateBtn(btn);
        showToast('Connection lost during generation');
    };
});

function resetGenerateBtn(btn) {
    btn.disabled = false;
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-spinner').style.display = 'none';
}

// Add custom source
document.getElementById('add-custom-source-btn').addEventListener('click', () => {
    document.getElementById('custom-source-modal').style.display = 'flex';
    document.getElementById('custom-source-name').value = '';
    document.getElementById('custom-source-url').value = '';
    document.getElementById('custom-source-description').value = '';
});

document.getElementById('save-custom-source-btn').addEventListener('click', async () => {
    const name = document.getElementById('custom-source-name').value.trim();
    const url = document.getElementById('custom-source-url').value.trim();
    const desc = document.getElementById('custom-source-description').value.trim();

    if (!name || !url) { showToast('Name and URL required'); return; }

    document.getElementById('custom-source-modal').style.display = 'none';

    try {
        const res = await fetch(`/api/profiles/${currentProfileId}/custom-source`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, url, description: desc })
        });
        if (res.ok) {
            // Reload profiles and re-render
            const data = await fetch('/api/profiles').then(r => r.json());
            profiles = data.profiles;
            renderSources();
            showToast('Source added');
        }
    } catch {
        showToast('Failed to add source');
    }
});

async function deleteCustomSource(name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
        const res = await fetch(`/api/profiles/${currentProfileId}/custom-source`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) {
            delete profiles[currentProfileId].sources[name];
            renderSources();
            showToast('Source deleted');
        }
    } catch {
        showToast('Failed to delete source');
    }
}

// ==================== 4. SETTINGS ====================
// Profile management
document.getElementById('new-profile-btn').addEventListener('click', () => {
    document.getElementById('new-profile-modal').style.display = 'flex';
    document.getElementById('new-profile-name').value = '';
});

document.getElementById('save-new-profile-btn').addEventListener('click', async () => {
    const name = document.getElementById('new-profile-name').value.trim();
    if (!name) { showToast('Enter a profile name'); return; }

    document.getElementById('new-profile-modal').style.display = 'none';
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');

    try {
        const res = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, name })
        });
        if (res.ok) {
            await fetch(`/api/profiles/${id}/switch`, { method: 'POST' });
            await fetch(`/api/device/${deviceId}/profile`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profile_id: id })
            });

            const data = await fetch('/api/profiles').then(r => r.json());
            profiles = data.profiles;
            currentProfileId = id;
            renderProfileSelector();
            renderSources();
            showToast(`Profile "${name}" created`);
        }
    } catch {
        showToast('Failed to create profile');
    }
});

document.getElementById('delete-profile-btn').addEventListener('click', async () => {
    if (currentProfileId === 'default') return;
    const name = profiles[currentProfileId]?.name || currentProfileId;
    if (!confirm(`Delete profile "${name}"?`)) return;

    try {
        const res = await fetch(`/api/profiles/${currentProfileId}`, { method: 'DELETE' });
        if (res.ok) {
            const data = await fetch('/api/profiles').then(r => r.json());
            profiles = data.profiles;
            currentProfileId = data.active_profile;
            renderProfileSelector();
            renderSources();
            showToast('Profile deleted');
        }
    } catch {
        showToast('Failed to delete profile');
    }
});

// Schedule management
async function loadSchedule() {
    if (!currentProfileId) return;
    try {
        const res = await fetch(`/api/profiles/${currentProfileId}/schedule`);
        if (!res.ok) return;
        const data = await res.json();
        const sched = data.schedule || {};

        document.getElementById('schedule-time').value = sched.time || '06:00';
        document.getElementById('schedule-timezone').value = sched.timezone || 'Australia/Sydney';
        document.getElementById('schedule-enabled').checked = sched.enabled || false;

        // Load next run info
        const schedRes = await fetch('/api/schedules');
        if (schedRes.ok) {
            const schedData = await schedRes.json();
            const job = (schedData.schedules || []).find(s => s.profile_id === currentProfileId);
            const nextRunEl = document.getElementById('schedule-next-run');
            if (job?.next_run) {
                const nextDate = new Date(job.next_run);
                nextRunEl.textContent = `Next bulletin: ${nextDate.toLocaleString('en-AU', {
                    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                })}`;
            } else {
                nextRunEl.textContent = sched.enabled ? 'Scheduled (pending)' : '';
            }
        }
    } catch (e) { console.warn(e); }
}

async function saveSchedule() {
    const enabled = document.getElementById('schedule-enabled').checked;
    const time = document.getElementById('schedule-time').value;
    const timezone = document.getElementById('schedule-timezone').value;

    try {
        await fetch(`/api/profiles/${currentProfileId}/schedule`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled, time, timezone })
        });
        showToast(enabled ? `Scheduled for ${time}` : 'Schedule disabled');
        loadSchedule();
    } catch {
        showToast('Failed to save schedule');
    }
}

document.getElementById('schedule-enabled').addEventListener('change', saveSchedule);
document.getElementById('schedule-time').addEventListener('change', saveSchedule);
document.getElementById('schedule-timezone').addEventListener('change', saveSchedule);

// Recent files
async function loadRecentFiles() {
    const list = document.getElementById('recent-files-list');
    try {
        const res = await fetch('/api/recent-files');
        const data = await res.json();

        if (data.files?.length) {
            list.innerHTML = data.files.map(f => `
                <div class="recent-item">
                    <div class="recent-item-info">
                        <div class="recent-item-name">${f.filename.replace('.mp3', '')}</div>
                        <div class="recent-item-meta">${formatFileSize(f.size)} · ${formatDate(f.modified)}</div>
                    </div>
                    <div class="recent-item-actions">
                        <button class="btn-icon-small btn-email-recent" data-filename="${f.filename}" title="Email">
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                        </button>
                        <a href="/api/download/${f.filename}" class="btn-icon-small" title="Download" download>
                            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                        </a>
                    </div>
                </div>
            `).join('');

            list.querySelectorAll('.btn-email-recent').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentEmailFilename = btn.dataset.filename;
                    document.getElementById('recipient-email').value = '';
                    document.getElementById('email-modal').style.display = 'flex';
                });
            });
        } else {
            list.innerHTML = '<p class="muted-text">No bulletins yet</p>';
        }
    } catch {
        list.innerHTML = '<p class="muted-text">Error loading files</p>';
    }
}

// Storage
async function loadStorageInfo() {
    try {
        const res = await fetch('/api/storage-info');
        const data = await res.json();
        document.getElementById('stat-file-count').textContent = data.file_count || 0;
        document.getElementById('stat-total-size').textContent = formatFileSize(data.total_size || 0);
    } catch (e) { console.warn(e); }
}

document.getElementById('cleanup-btn').addEventListener('click', async () => {
    if (!confirm('Delete all bulletins except the 10 most recent?')) return;
    try {
        const res = await fetch('/api/cleanup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keep_count: 10 })
        });
        const data = await res.json();
        if (res.ok) {
            showToast(`Deleted ${data.deleted} files`);
            loadStorageInfo();
            loadRecentFiles();
        }
    } catch {
        showToast('Cleanup failed');
    }
});

// Email modal
document.getElementById('send-email-btn').addEventListener('click', async () => {
    const email = document.getElementById('recipient-email').value.trim();
    if (!email || !email.includes('@')) { showToast('Enter a valid email'); return; }
    if (!currentEmailFilename) return;

    document.getElementById('email-modal').style.display = 'none';
    showToast('Sending...');

    try {
        const res = await fetch(`/api/email/${currentEmailFilename}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await res.json();
        showToast(res.ok ? data.message : (data.message || 'Send failed'));
    } catch {
        showToast('Error sending email');
    }
    currentEmailFilename = null;
});

document.getElementById('recipient-email').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('send-email-btn').click();
});

// Modal close on outside click and cancel buttons
window.addEventListener('click', e => {
    if (e.target.classList.contains('modal')) e.target.style.display = 'none';
});

document.querySelectorAll('.modal-cancel').forEach(btn => {
    btn.addEventListener('click', () => {
        btn.closest('.modal').style.display = 'none';
    });
});

// ==================== 5. INIT ====================
document.addEventListener('DOMContentLoaded', async () => {
    deviceId = getDeviceId();
    await loadProfiles();
    renderProfileSelector();
    renderSources();
    loadLatestBulletin();
});
