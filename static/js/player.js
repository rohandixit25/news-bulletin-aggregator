/**
 * Mobile Audio Player for News Bulletin Aggregator
 * Implements playback controls and Media Session API for iOS lock screen controls
 */

// DOM Elements
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const errorMessage = document.getElementById('error-message');
const player = document.getElementById('player');
const audio = document.getElementById('audio');

const bulletinTitle = document.getElementById('bulletin-title');
const bulletinProfile = document.getElementById('bulletin-profile');
const bulletinDate = document.getElementById('bulletin-date');
const offlineIndicator = document.getElementById('offline-indicator');

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
const currentTime = document.getElementById('current-time');
const duration = document.getElementById('duration');

// State
let bulletinData = null;
let playbackSpeeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
let currentSpeedIndex = 1; // Start at 1.0x
let preferredSpeed = parseFloat(localStorage.getItem('preferredSpeed') || '1.0');

/**
 * Initialize player on page load
 */
async function init() {
    try {
        // Fetch latest bulletin
        const response = await fetch('/api/latest-bulletin');

        if (!response.ok) {
            throw new Error('No bulletin available');
        }

        bulletinData = await response.json();

        // Update UI
        bulletinTitle.textContent = 'Today\'s News Bulletin';
        bulletinProfile.textContent = bulletinData.profile_name || 'News';
        bulletinDate.textContent = formatDate(bulletinData.date);

        // Load audio
        audio.src = `/api/download/${bulletinData.filename}`;

        // Wait for metadata to load
        audio.addEventListener('loadedmetadata', onMetadataLoaded);
        audio.addEventListener('error', onAudioError);

    } catch (err) {
        showError(err.message || 'Unable to load bulletin. Please try again.');
    }
}

/**
 * Handle audio metadata loaded
 */
function onMetadataLoaded() {
    // Hide loading, show player
    loading.style.display = 'none';
    player.style.display = 'flex';

    // Update duration
    duration.textContent = formatTime(audio.duration);
    progressSlider.max = audio.duration;

    // Apply preferred speed
    audio.playbackRate = preferredSpeed;
    currentSpeedIndex = playbackSpeeds.indexOf(preferredSpeed);
    if (currentSpeedIndex === -1) currentSpeedIndex = 1;
    speedLabel.textContent = `${preferredSpeed.toFixed(2)}x`;

    // Setup Media Session API for lock screen controls
    setupMediaSession();

    // Restore playback position if available
    restorePlaybackPosition();

    // Auto-play on mobile (requires user gesture, so we just prepare)
    // User must tap play button first time
}

/**
 * Check if audio is fully buffered (available offline)
 */
function checkOfflineAvailability() {
    if (audio.buffered.length > 0) {
        const bufferedEnd = audio.buffered.end(audio.buffered.length - 1);
        const duration = audio.duration;

        // Show offline indicator if >90% buffered
        if (bufferedEnd / duration > 0.9) {
            offlineIndicator.style.display = 'flex';
        }
    }
}

/**
 * Save playback position to localStorage
 */
function savePlaybackPosition() {
    if (bulletinData && audio.currentTime > 0 && audio.currentTime < audio.duration - 5) {
        localStorage.setItem('lastBulletinFile', bulletinData.filename);
        localStorage.setItem('lastPlaybackPosition', audio.currentTime.toString());
        localStorage.setItem('lastPlaybackTime', Date.now().toString());
    }
}

/**
 * Restore playback position from localStorage
 */
function restorePlaybackPosition() {
    try {
        const savedFile = localStorage.getItem('lastBulletinFile');
        const savedPosition = parseFloat(localStorage.getItem('lastPlaybackPosition') || '0');
        const savedTime = parseInt(localStorage.getItem('lastPlaybackTime') || '0');

        // Only restore if same file, valid position, and saved within last 24 hours
        if (savedFile === bulletinData.filename &&
            savedPosition > 5 &&
            savedPosition < audio.duration - 5 &&
            Date.now() - savedTime < 24 * 60 * 60 * 1000) {

            audio.currentTime = savedPosition;

            // Show toast notification
            showToast(`Resuming from ${formatTime(savedPosition)}`);
        }
    } catch (e) {
        console.log('Could not restore playback position:', e);
    }
}

/**
 * Show toast notification
 */
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
}

/**
 * Handle audio loading error
 */
function onAudioError() {
    showError('Failed to load audio file. Please check your connection.');
}

/**
 * Show error message
 */
function showError(message) {
    loading.style.display = 'none';
    player.style.display = 'none';
    error.style.display = 'flex';
    errorMessage.textContent = message;
}

/**
 * Setup Media Session API for lock screen controls (iOS/Android)
 */
function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: 'Today\'s News Bulletin',
            artist: bulletinData.profile_name || 'News Bulletin',
            album: 'Daily News',
            artwork: [
                { src: '/static/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
                { src: '/static/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
                { src: '/static/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: '/static/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
            ]
        });

        // Setup action handlers for lock screen
        navigator.mediaSession.setActionHandler('play', () => {
            audio.play();
            updatePlayPauseButton();
        });

        navigator.mediaSession.setActionHandler('pause', () => {
            audio.pause();
            updatePlayPauseButton();
        });

        navigator.mediaSession.setActionHandler('seekbackward', (details) => {
            const skipTime = details.seekOffset || 15;
            audio.currentTime = Math.max(0, audio.currentTime - skipTime);
        });

        navigator.mediaSession.setActionHandler('seekforward', (details) => {
            const skipTime = details.seekOffset || 15;
            audio.currentTime = Math.min(audio.duration, audio.currentTime + skipTime);
        });

        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.fastSeek && 'fastSeek' in audio) {
                audio.fastSeek(details.seekTime);
            } else {
                audio.currentTime = details.seekTime;
            }
        });
    }
}

/**
 * Update Media Session playback state
 */
function updateMediaSessionState() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing';

        // Update position state
        if (audio.duration && !isNaN(audio.duration)) {
            navigator.mediaSession.setPositionState({
                duration: audio.duration,
                playbackRate: audio.playbackRate,
                position: audio.currentTime
            });
        }
    }
}

/**
 * Play/Pause toggle
 */
playPauseBtn.addEventListener('click', () => {
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
    updatePlayPauseButton();
    updateMediaSessionState();
});

/**
 * Update play/pause button icon
 */
function updatePlayPauseButton() {
    if (audio.paused) {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        playPauseBtn.title = 'Play';
    } else {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        playPauseBtn.title = 'Pause';
    }
}

/**
 * Skip back 15 seconds
 */
skipBackBtn.addEventListener('click', () => {
    audio.currentTime = Math.max(0, audio.currentTime - 15);
});

/**
 * Skip forward 15 seconds
 */
skipForwardBtn.addEventListener('click', () => {
    audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
});

/**
 * Cycle through playback speeds
 */
speedControl.addEventListener('click', () => {
    currentSpeedIndex = (currentSpeedIndex + 1) % playbackSpeeds.length;
    const newSpeed = playbackSpeeds[currentSpeedIndex];
    audio.playbackRate = newSpeed;
    speedLabel.textContent = `${newSpeed.toFixed(2)}x`;
    updateMediaSessionState();
});

/**
 * Download current bulletin
 */
downloadBtn.addEventListener('click', () => {
    if (bulletinData && bulletinData.filename) {
        // Create a temporary anchor element to trigger download
        const downloadUrl = `/api/download/${bulletinData.filename}`;
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = bulletinData.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
});

/**
 * Update progress as audio plays
 */
audio.addEventListener('timeupdate', () => {
    if (!isNaN(audio.duration)) {
        const progress = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = `${progress}%`;
        progressSlider.value = audio.currentTime;
        currentTime.textContent = formatTime(audio.currentTime);

        // Update Media Session position periodically
        updateMediaSessionState();

        // Check offline availability
        checkOfflineAvailability();

        // Save playback position
        savePlaybackPosition();
    }
});

/**
 * Seek when user drags progress slider
 */
progressSlider.addEventListener('input', (e) => {
    const seekTime = parseFloat(e.target.value);
    audio.currentTime = seekTime;
    progressFill.style.width = `${(seekTime / audio.duration) * 100}%`;
    currentTime.textContent = formatTime(seekTime);
});

/**
 * Handle audio ended
 */
audio.addEventListener('ended', () => {
    updatePlayPauseButton();
    updateMediaSessionState();

    // Show speed preset prompt if first time finishing a bulletin
    showSpeedPresetPrompt();
});

/**
 * Show speed preset prompt after first bulletin
 */
function showSpeedPresetPrompt() {
    const hasSeenPrompt = localStorage.getItem('hasSeenSpeedPrompt');

    if (!hasSeenPrompt) {
        const modal = document.getElementById('speed-preset-modal');
        modal.style.display = 'flex';

        // Handle speed option clicks
        document.querySelectorAll('.speed-option').forEach(button => {
            button.addEventListener('click', () => {
                const speed = parseFloat(button.dataset.speed);
                setPreferredSpeed(speed);
                modal.style.display = 'none';
                localStorage.setItem('hasSeenSpeedPrompt', 'true');
                showToast(`Default speed set to ${speed}x`);
            });
        });

        // Handle skip button
        document.getElementById('skip-speed-preset').addEventListener('click', () => {
            modal.style.display = 'none';
            localStorage.setItem('hasSeenSpeedPrompt', 'true');
        });
    }
}

/**
 * Set preferred playback speed
 */
function setPreferredSpeed(speed) {
    preferredSpeed = speed;
    localStorage.setItem('preferredSpeed', speed.toString());
    audio.playbackRate = speed;
    speedLabel.textContent = `${speed.toFixed(2)}x`;
    currentSpeedIndex = playbackSpeeds.indexOf(speed);
    if (currentSpeedIndex === -1) currentSpeedIndex = 1;
}

/**
 * Handle play state changes
 */
audio.addEventListener('play', () => {
    updatePlayPauseButton();
    updateMediaSessionState();
});

audio.addEventListener('pause', () => {
    updatePlayPauseButton();
    updateMediaSessionState();
});

/**
 * Format time in MM:SS or HH:MM:SS
 */
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}:${padZero(minutes)}:${padZero(secs)}`;
    }
    return `${minutes}:${padZero(secs)}`;
}

/**
 * Pad number with leading zero
 */
function padZero(num) {
    return num.toString().padStart(2, '0');
}

/**
 * Format date string
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const today = new Date();

        // Check if today
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        }

        // Check if yesterday
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        }

        // Format as readable date
        return date.toLocaleDateString('en-AU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateString;
    }
}

/**
 * Prevent screen lock during playback (iOS)
 */
if ('wakeLock' in navigator) {
    let wakeLock = null;

    audio.addEventListener('play', async () => {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            // Wake Lock not supported or denied
            console.log('Wake Lock not available:', err);
        }
    });

    audio.addEventListener('pause', () => {
        if (wakeLock !== null) {
            wakeLock.release();
            wakeLock = null;
        }
    });
}

// Initialize player when page loads
init();
