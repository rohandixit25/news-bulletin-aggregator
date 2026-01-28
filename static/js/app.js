/**
 * News Bulletin Aggregator - Frontend JavaScript (Multi-Profile)
 */

// Global state
let currentProfileId = null;
let profiles = {};
let deviceId = null;

// Cookie helper functions
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    console.log('Set cookie:', name, '=', value);
}

function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) == 0) {
            const value = c.substring(nameEQ.length, c.length);
            console.log('Retrieved cookie:', name, '=', value);
            return value;
        }
    }
    console.log('Cookie not found:', name);
    return null;
}

// Generate or retrieve device ID using cookies
function getDeviceId() {
    let id = getCookie('deviceId');

    if (!id) {
        id = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        console.log('Generated new deviceId:', id);
        setCookie('deviceId', id, 365); // Store for 1 year
    }

    return id;
}

// DOM Elements
const profileSelector = document.getElementById('profile-selector');
const newProfileBtn = document.getElementById('new-profile-btn');
const deleteProfileBtn = document.getElementById('delete-profile-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const generateBtn = document.getElementById('generate-btn');
const addCustomSourceBtn = document.getElementById('add-custom-source-btn');
const statusMessage = document.getElementById('status-message');
const generationProgress = document.getElementById('generation-progress');
const recentFilesList = document.getElementById('recent-files-list');
const profileNameDisplay = document.getElementById('profile-name-display');

// Modal elements
const customSourceModal = document.getElementById('custom-source-modal');
const newProfileModal = document.getElementById('new-profile-modal');
const emailModal = document.getElementById('email-modal');
const cancelCustomSourceBtn = document.getElementById('cancel-custom-source-btn');
const saveCustomSourceBtn = document.getElementById('save-custom-source-btn');
const cancelNewProfileBtn = document.getElementById('cancel-new-profile-btn');
const saveNewProfileBtn = document.getElementById('save-new-profile-btn');
const cancelEmailBtn = document.getElementById('cancel-email-btn');
const sendEmailBtn = document.getElementById('send-email-btn');
const recipientEmailInput = document.getElementById('recipient-email');

// Show status message
function showStatus(message, type = 'info') {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'block';

    setTimeout(() => {
        statusMessage.style.display = 'none';
    }, 5000);
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Format date
function formatDate(isoString) {
    const date = new Date(isoString);
    const options = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return date.toLocaleDateString('en-AU', options);
}

// Get current sources configuration from checkboxes
function getCurrentSources() {
    const checkboxes = document.querySelectorAll('input[name="source"]');
    const sources = {};

    checkboxes.forEach(checkbox => {
        const name = checkbox.value;
        const sourceItem = checkbox.closest('.source-item');
        const description = sourceItem.querySelector('.source-description').textContent;
        const isCustom = checkbox.dataset.custom === 'true';

        sources[name] = {
            enabled: checkbox.checked,
            url: checkbox.dataset.url,
            description: description,
            custom: isCustom
        };
    });

    return sources;
}

// Check if device has linked profile
async function getDeviceProfile() {
    try {
        const response = await fetch(`/api/device/${deviceId}/profile`);
        const data = await response.json();

        if (response.ok && data.profile_id) {
            return data.profile_id;
        }
        return null;
    } catch (error) {
        console.error('Error getting device profile:', error);
        return null;
    }
}

// Link device to profile
async function linkDeviceToProfile(profileId) {
    try {
        await fetch(`/api/device/${deviceId}/profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile_id: profileId })
        });
    } catch (error) {
        console.error('Error linking device to profile:', error);
    }
}

// Load profiles from server
async function loadProfiles() {
    try {
        // Check if device has a linked profile
        const linkedProfileId = await getDeviceProfile();
        console.log('Linked profile:', linkedProfileId);

        const response = await fetch('/api/profiles');
        const data = await response.json();

        profiles = data.profiles;

        // If device has linked profile, use it. Otherwise use server's active profile
        if (linkedProfileId && profiles[linkedProfileId]) {
            currentProfileId = linkedProfileId;
            console.log('Using device profile:', currentProfileId);
            // Switch to device's profile
            await fetch(`/api/profiles/${linkedProfileId}/switch`, { method: 'POST' });
        } else {
            currentProfileId = data.active_profile;
            console.log('Using server active profile:', currentProfileId);
        }

        return data;
    } catch (error) {
        showStatus('Error loading profiles: ' + error.message, 'error');
        console.error('Error loading profiles:', error);
    }
}

// Switch profile
async function switchProfile(profileId) {
    try {
        const response = await fetch(`/api/profiles/${profileId}/switch`, {
            method: 'POST'
        });

        if (response.ok) {
            // Reload page to show new profile's sources
            window.location.reload();
        } else {
            showStatus('Failed to switch profile', 'error');
        }
    } catch (error) {
        showStatus('Error switching profile: ' + error.message, 'error');
    }
}

// Create new profile
async function createProfile(profileName) {
    try {
        const profileId = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '_');

        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                id: profileId,
                name: profileName
            })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('Profile created successfully', 'success');
            // Switch to new profile
            await switchProfile(profileId);
        } else {
            showStatus('Failed to create profile: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Error creating profile: ' + error.message, 'error');
    }
}

// Delete current profile
async function deleteCurrentProfile() {
    if (currentProfileId === 'default') {
        showStatus('Cannot delete default profile', 'error');
        return;
    }

    if (!confirm(`Delete profile "${profiles[currentProfileId].name}"? This cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch(`/api/profiles/${currentProfileId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showStatus('Profile deleted', 'success');
            // Reload to switch to default profile
            window.location.reload();
        } else {
            showStatus('Failed to delete profile', 'error');
        }
    } catch (error) {
        showStatus('Error deleting profile: ' + error.message, 'error');
    }
}

// Save current profile configuration
async function saveConfiguration() {
    try {
        const sources = getCurrentSources();

        const response = await fetch(`/api/profiles/${currentProfileId}/sources`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sources })
        });

        if (response.ok) {
            showStatus('Configuration saved successfully', 'success');
        } else {
            showStatus('Failed to save configuration', 'error');
        }
    } catch (error) {
        showStatus('Error saving configuration: ' + error.message, 'error');
    }
}

// Add custom source
async function addCustomSource(name, url, description) {
    try {
        const response = await fetch(`/api/profiles/${currentProfileId}/custom-source`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, url, description })
        });

        if (response.ok) {
            showStatus('Custom source added successfully', 'success');
            // Reload to show new source
            window.location.reload();
        } else {
            const data = await response.json();
            showStatus('Failed to add source: ' + data.message, 'error');
        }
    } catch (error) {
        showStatus('Error adding source: ' + error.message, 'error');
    }
}

// Delete custom source
async function deleteCustomSource(sourceName) {
    if (!confirm(`Delete "${sourceName}"?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/profiles/${currentProfileId}/custom-source`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name: sourceName })
        });

        if (response.ok) {
            showStatus('Source deleted', 'success');
            // Reload to update UI
            window.location.reload();
        } else {
            showStatus('Failed to delete source', 'error');
        }
    } catch (error) {
        showStatus('Error deleting source: ' + error.message, 'error');
    }
}

// Generate bulletin with real-time progress
function generateBulletin() {
    // Disable button and show spinner
    generateBtn.disabled = true;
    generateBtn.querySelector('.btn-text').style.display = 'none';
    generateBtn.querySelector('.btn-spinner').style.display = 'inline-flex';

    // Show progress
    generationProgress.style.display = 'block';
    generationProgress.innerHTML = '<div class="progress-log"></div>';
    const progressLog = generationProgress.querySelector('.progress-log');

    // Create Server-Sent Events connection
    const eventSource = new EventSource('/api/generate/stream');

    eventSource.onmessage = (event) => {
        try {
            const progress = JSON.parse(event.data);

            // Create progress message
            let icon = '';
            let className = '';

            switch (progress.stage) {
                case 'downloading':
                    icon = '📥';
                    className = 'progress-downloading';
                    break;
                case 'processing':
                    icon = '⚙️';
                    className = 'progress-processing';
                    break;
                case 'complete':
                    icon = '✅';
                    className = 'progress-complete';
                    break;
                case 'warning':
                    icon = '⚠️';
                    className = 'progress-warning';
                    break;
                case 'error':
                    icon = '❌';
                    className = 'progress-error';
                    break;
            }

            // Add progress message
            const logEntry = document.createElement('div');
            logEntry.className = `progress-entry ${className}`;
            logEntry.innerHTML = `<span class="progress-icon">${icon}</span><span class="progress-text">${progress.message}</span>`;
            progressLog.appendChild(logEntry);

            // Auto-scroll to bottom
            progressLog.scrollTop = progressLog.scrollHeight;

            // Handle completion
            if (progress.stage === 'complete') {
                eventSource.close();
                showStatus('Bulletin generated successfully!', 'success');
                loadRecentFiles();
                loadBulletinSelector(); // Refresh player dropdown

                // Re-enable button after delay
                setTimeout(() => {
                    generateBtn.disabled = false;
                    generateBtn.querySelector('.btn-text').style.display = 'inline';
                    generateBtn.querySelector('.btn-spinner').style.display = 'none';
                }, 1000);
            }

            // Handle errors
            if (progress.stage === 'error') {
                eventSource.close();
                showStatus('Generation failed: ' + progress.message, 'error');

                // Re-enable button
                generateBtn.disabled = false;
                generateBtn.querySelector('.btn-text').style.display = 'inline';
                generateBtn.querySelector('.btn-spinner').style.display = 'none';
            }

        } catch (e) {
            console.error('Error parsing progress:', e);
        }
    };

    eventSource.onerror = () => {
        eventSource.close();
        showStatus('Connection lost during generation', 'error');

        // Re-enable button
        generateBtn.disabled = false;
        generateBtn.querySelector('.btn-text').style.display = 'inline';
        generateBtn.querySelector('.btn-spinner').style.display = 'none';
    };
}

// Load recent files
async function loadRecentFiles() {
    try {
        const response = await fetch('/api/recent-files');
        const data = await response.json();

        if (response.ok && data.files && data.files.length > 0) {
            recentFilesList.innerHTML = data.files.map(file => `
                <div class="file-item" data-filename="${file.filename}">
                    <div class="file-info">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-meta">
                            ${formatFileSize(file.size)} • ${formatDate(file.modified)}
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="btn btn-secondary btn-view-details" data-filename="${file.filename}">
                            Details
                        </button>
                        <button class="btn btn-secondary btn-email" data-filename="${file.filename}">
                            Email
                        </button>
                        <a href="/api/download/${file.filename}" class="btn btn-download" download>
                            Download
                        </a>
                    </div>
                    <div class="bulletin-metadata" id="metadata-${file.filename}" style="display: none;">
                        <div class="metadata-loading">Loading details...</div>
                    </div>
                </div>
            `).join('');
        } else {
            recentFilesList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📻</div>
                    <div class="empty-state-title">No bulletins yet</div>
                    <div class="empty-state-text">Click "Generate Bulletin" above to create your first news digest</div>
                </div>
            `;
        }
    } catch (error) {
        recentFilesList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">⚠️</div>
                <div class="empty-state-title">Error loading files</div>
                <div class="empty-state-text">Please refresh the page to try again</div>
            </div>
        `;
    }
}

// Load and display bulletin metadata
async function toggleBulletinDetails(filename) {
    const metadataDiv = document.getElementById(`metadata-${filename}`);

    if (!metadataDiv) return;

    // Toggle visibility
    if (metadataDiv.style.display === 'none') {
        metadataDiv.style.display = 'block';

        // Load metadata if not already loaded
        if (metadataDiv.querySelector('.metadata-loading')) {
            try {
                const response = await fetch(`/api/bulletin/${filename}/metadata`);
                const data = await response.json();

                if (response.ok && data.metadata) {
                    const meta = data.metadata;
                    const totalMinutes = Math.floor(meta.total_duration / 60);
                    const totalSeconds = Math.floor(meta.total_duration % 60);

                    let sourcesHTML = '';
                    if (meta.source_details && meta.source_details.length > 0) {
                        sourcesHTML = `
                            <div class="metadata-section">
                                <h4>Sources (${meta.sources_succeeded.length} of ${meta.sources_attempted.length})</h4>
                                <ul class="metadata-sources">
                                    ${meta.source_details.map(source => {
                                        const mins = Math.floor(source.duration / 60);
                                        const secs = Math.floor(source.duration % 60);
                                        return `<li><strong>${source.name}</strong> - ${mins}:${secs.toString().padStart(2, '0')}</li>`;
                                    }).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    let failuresHTML = '';
                    if (meta.sources_failed && meta.sources_failed.length > 0) {
                        failuresHTML = `
                            <div class="metadata-section metadata-failures">
                                <h4>⚠️ Unavailable Sources</h4>
                                <ul class="metadata-sources">
                                    ${meta.sources_failed.map(failure => {
                                        const reason = failure.reason ? ` - ${failure.reason.substring(0, 50)}` : '';
                                        return `<li>${failure.name}${reason}</li>`;
                                    }).join('')}
                                </ul>
                            </div>
                        `;
                    }

                    metadataDiv.innerHTML = `
                        <div class="metadata-content">
                            ${sourcesHTML}
                            ${failuresHTML}
                            <div class="metadata-total">
                                <strong>Total Duration:</strong> ${totalMinutes}:${totalSeconds.toString().padStart(2, '0')}
                            </div>
                        </div>
                    `;
                } else {
                    metadataDiv.innerHTML = `
                        <div class="metadata-content">
                            <p>No metadata available for this bulletin.</p>
                        </div>
                    `;
                }
            } catch (error) {
                metadataDiv.innerHTML = `
                    <div class="metadata-content">
                        <p>Error loading metadata: ${error.message}</p>
                    </div>
                `;
            }
        }
    } else {
        metadataDiv.style.display = 'none';
    }
}

// Email bulletin - show modal to get recipient email
let currentEmailFilename = null;

function emailBulletin(filename) {
    currentEmailFilename = filename;
    recipientEmailInput.value = ''; // Clear previous input
    emailModal.style.display = 'flex';
    recipientEmailInput.focus();
}

// Actually send the email with provided recipient address
async function sendEmailToRecipient() {
    const email = recipientEmailInput.value.trim();

    // Input validation: Check email format
    if (!email || !email.includes('@')) {
        showStatus('Please enter a valid email address', 'error');
        return;
    }

    if (!currentEmailFilename) {
        showStatus('No file selected', 'error');
        return;
    }

    // Close modal and show sending status
    emailModal.style.display = 'none';
    showStatus('Sending email...', 'info');

    try {
        const response = await fetch(`/api/email/${currentEmailFilename}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email: email })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(data.message, 'success');
        } else {
            showStatus(data.message || 'Failed to send email', 'error');
        }
    } catch (error) {
        showStatus('Error sending email: ' + error.message, 'error');
    } finally {
        currentEmailFilename = null;
    }
}

// Load storage information
async function loadStorageInfo() {
    try {
        const response = await fetch('/api/storage-info');
        const data = await response.json();

        if (response.ok) {
            document.getElementById('stat-file-count').textContent = data.file_count || 0;
            document.getElementById('stat-total-size').textContent = formatFileSize(data.total_size || 0);

            if (data.oldest_file) {
                const oldestDate = new Date(data.oldest_file);
                const daysOld = Math.floor((Date.now() - oldestDate) / (1000 * 60 * 60 * 24));
                document.getElementById('stat-oldest-file').textContent = `${daysOld} days ago`;
            } else {
                document.getElementById('stat-oldest-file').textContent = 'N/A';
            }
        }
    } catch (error) {
        showStatus('Error loading storage info: ' + error.message, 'error');
    }
}

// Cleanup old files
async function cleanupOldFiles() {
    if (!confirm('Delete all bulletins except the 10 most recent? This cannot be undone.')) {
        return;
    }

    showStatus('Cleaning up old files...', 'info');

    try {
        const response = await fetch('/api/cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ keep_count: 10 })
        });

        const data = await response.json();

        if (response.ok) {
            showStatus(`Deleted ${data.deleted_count} files, freed ${formatFileSize(data.freed_space)}`, 'success');
            loadStorageInfo();
            loadRecentFiles();
        } else {
            showStatus(data.message || 'Cleanup failed', 'error');
        }
    } catch (error) {
        showStatus('Error during cleanup: ' + error.message, 'error');
    }
}

// Event Listeners
profileSelector.addEventListener('change', (e) => {
    switchProfile(e.target.value);
});

newProfileBtn.addEventListener('click', () => {
    newProfileModal.style.display = 'flex';
    document.getElementById('new-profile-name').value = '';
});

deleteProfileBtn.addEventListener('click', deleteCurrentProfile);

saveConfigBtn.addEventListener('click', saveConfiguration);

generateBtn.addEventListener('click', generateBulletin);

addCustomSourceBtn.addEventListener('click', () => {
    customSourceModal.style.display = 'flex';
    document.getElementById('custom-source-name').value = '';
    document.getElementById('custom-source-url').value = '';
    document.getElementById('custom-source-description').value = '';
});

cancelCustomSourceBtn.addEventListener('click', () => {
    customSourceModal.style.display = 'none';
});

saveCustomSourceBtn.addEventListener('click', () => {
    const name = document.getElementById('custom-source-name').value.trim();
    const url = document.getElementById('custom-source-url').value.trim();
    const description = document.getElementById('custom-source-description').value.trim();

    if (!name || !url) {
        showStatus('Please enter both name and URL', 'error');
        return;
    }

    customSourceModal.style.display = 'none';
    addCustomSource(name, url, description);
});

cancelNewProfileBtn.addEventListener('click', () => {
    newProfileModal.style.display = 'none';
});

cancelEmailBtn.addEventListener('click', () => {
    emailModal.style.display = 'none';
    currentEmailFilename = null;
});

sendEmailBtn.addEventListener('click', sendEmailToRecipient);

// Allow Enter key to send email in modal
recipientEmailInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendEmailToRecipient();
    }
});

// Storage management buttons
document.getElementById('refresh-storage-btn').addEventListener('click', loadStorageInfo);
document.getElementById('cleanup-old-files-btn').addEventListener('click', cleanupOldFiles);

saveNewProfileBtn.addEventListener('click', () => {
    const profileName = document.getElementById('new-profile-name').value.trim();

    if (!profileName) {
        showStatus('Please enter a profile name', 'error');
        return;
    }

    newProfileModal.style.display = 'none';
    createProfile(profileName);
});

// Delete source buttons, email buttons, and details buttons (delegated event handling)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-source')) {
        const sourceName = e.target.dataset.source;
        deleteCustomSource(sourceName);
    }

    if (e.target.classList.contains('btn-email')) {
        const filename = e.target.dataset.filename;
        emailBulletin(filename);
    }

    if (e.target.classList.contains('btn-view-details')) {
        const filename = e.target.dataset.filename;
        toggleBulletinDetails(filename);
    }
});

// Close modals on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Onboarding flow for new users
let onboardingData = {
    profileName: '',
    sources: {}
};

async function showOnboarding() {
    // Check if this device has a linked profile
    const linkedProfile = await getDeviceProfile();
    console.log('Onboarding check - Device has linked profile:', linkedProfile);

    // Only show onboarding if device has no linked profile
    if (!linkedProfile) {
        console.log('Showing onboarding modal');
        const onboardingModal = document.getElementById('onboarding-modal');
        if (onboardingModal) {
            onboardingModal.style.display = 'flex';
            showOnboardingStep(1);
        }
    } else {
        console.log('Skipping onboarding - device already linked');
    }
}

function showOnboardingStep(step) {
    // Hide all steps
    for (let i = 1; i <= 3; i++) {
        const stepDiv = document.getElementById(`onboarding-step-${i}`);
        if (stepDiv) stepDiv.style.display = 'none';
    }

    // Show current step
    const currentStep = document.getElementById(`onboarding-step-${step}`);
    if (currentStep) {
        currentStep.style.display = 'block';

        // If step 3, populate sources
        if (step === 3) {
            populateOnboardingSources();
        }
    }
}

function populateOnboardingSources() {
    const sourcesList = document.getElementById('onboarding-sources-list');
    if (!sourcesList) return;

    // Get default sources from current profile
    const defaultProfile = profiles['default'] || { sources: {} };
    const sources = defaultProfile.sources;

    sourcesList.innerHTML = Object.keys(sources).map(name => {
        const data = sources[name];
        return `
            <label class="source-item">
                <input
                    type="checkbox"
                    name="onboarding-source"
                    value="${name}"
                    checked
                    data-url="${data.url}"
                    data-description="${data.description}"
                >
                <div class="source-info">
                    <span class="source-name">${name}</span>
                    <span class="source-description">${data.description}</span>
                </div>
            </label>
        `;
    }).join('');
}

async function completeOnboarding() {
    const profileName = document.getElementById('onboarding-profile-name').value.trim();

    if (!profileName) {
        showStatus('Please enter a profile name', 'error');
        return;
    }

    // Collect selected sources
    const sourceCheckboxes = document.querySelectorAll('input[name="onboarding-source"]');
    const selectedSources = {};

    sourceCheckboxes.forEach(checkbox => {
        const name = checkbox.value;
        selectedSources[name] = {
            enabled: checkbox.checked,
            url: checkbox.dataset.url,
            description: checkbox.dataset.description,
            custom: false
        };
    });

    // Create profile
    const profileId = profileName.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    console.log('Creating profile:', profileId, 'for device:', deviceId);

    try {
        const response = await fetch('/api/profiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: profileId, name: profileName })
        });

        let profileExists = false;

        if (response.ok) {
            console.log('Profile created successfully');
        } else if (response.status === 400) {
            const errorData = await response.json();
            if (errorData.message && errorData.message.includes('already exists')) {
                console.log('Profile already exists, using existing profile');
                profileExists = true;
            } else {
                console.error('Profile creation failed:', errorData);
                showStatus('Error: ' + errorData.message, 'error');
                return;
            }
        } else {
            const errorData = await response.json();
            console.error('Profile creation failed:', errorData);
            showStatus('Error creating profile: ' + errorData.message, 'error');
            return;
        }

        // Save sources for the profile (new or existing)
        await fetch(`/api/profiles/${profileId}/sources`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sources: selectedSources })
        });

        // Switch to this profile
        await fetch(`/api/profiles/${profileId}/switch`, { method: 'POST' });

        // Link this device to the profile
        console.log('Linking device to profile...');
        await linkDeviceToProfile(profileId);
        console.log('Device linked successfully');

        // Close modal
        document.getElementById('onboarding-modal').style.display = 'none';

        // Reload to show new profile
        window.location.reload();

    } catch (error) {
        console.error('Error in completeOnboarding:', error);
        showStatus('Error creating profile: ' + error.message, 'error');
    }
}

// Onboarding navigation
document.getElementById('onboarding-next-1')?.addEventListener('click', () => showOnboardingStep(2));
document.getElementById('onboarding-back-2')?.addEventListener('click', () => showOnboardingStep(1));
document.getElementById('onboarding-next-2')?.addEventListener('click', () => {
    const profileName = document.getElementById('onboarding-profile-name').value.trim();
    if (!profileName) {
        showStatus('Please enter a profile name', 'error');
        return;
    }
    showOnboardingStep(3);
});
document.getElementById('onboarding-back-3')?.addEventListener('click', () => showOnboardingStep(2));
document.getElementById('onboarding-finish')?.addEventListener('click', completeOnboarding);

// Player functionality
const audio = document.getElementById('audio');
const playBtn = document.getElementById('play-btn');
const playIcon = document.getElementById('play-icon');
const pauseIcon = document.getElementById('pause-icon');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const speedBtn = document.getElementById('speed-btn');
const speedText = document.getElementById('speed-text');
const bulletinSelector = document.getElementById('bulletin-selector');
const audioPlayer = document.getElementById('audio-player');
const noBulletinMessage = document.getElementById('no-bulletin-message');

let currentBulletin = null;

// Load available bulletins into dropdown
async function loadBulletinSelector() {
    try {
        const response = await fetch('/api/recent-files');
        const data = await response.json();

        if (response.ok && data.files && data.files.length > 0) {
            // Filter bulletins for current profile only
            const profileBulletins = data.files.filter(file =>
                file.filename.startsWith(currentProfileId + '_')
            );

            if (profileBulletins.length > 0) {
                bulletinSelector.innerHTML = profileBulletins.map((file, index) => `
                    <option value="${file.filename}" ${index === 0 ? 'selected' : ''}>
                        ${file.filename.replace('.mp3', '').replace(currentProfileId + '_', '')}
                    </option>
                `).join('');

                // Auto-load first bulletin
                loadBulletin(profileBulletins[0].filename);
            } else {
                bulletinSelector.innerHTML = '<option value="">No bulletins available</option>';
                audioPlayer.style.display = 'none';
                noBulletinMessage.style.display = 'block';
            }
        } else {
            bulletinSelector.innerHTML = '<option value="">No bulletins available</option>';
            audioPlayer.style.display = 'none';
            noBulletinMessage.style.display = 'block';
        }
    } catch (error) {
        showStatus('Error loading bulletins: ' + error.message, 'error');
    }
}

// Load selected bulletin
function loadBulletin(filename) {
    if (!filename) return;

    currentBulletin = filename;
    audio.src = `/api/download/${filename}`;
    document.getElementById('bulletin-filename').textContent = filename.replace('.mp3', '');
    audioPlayer.style.display = 'block';
    noBulletinMessage.style.display = 'none';
}

// Format time in MM:SS
function formatPlayerTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Play/Pause toggle
if (playBtn) {
    playBtn.addEventListener('click', () => {
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    });
}

// Update play/pause icon
if (audio) {
    audio.addEventListener('play', () => {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
    });

    audio.addEventListener('pause', () => {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
    });

    // Update time display
    audio.addEventListener('timeupdate', () => {
        if (currentTimeEl) currentTimeEl.textContent = formatPlayerTime(audio.currentTime);
    });

    audio.addEventListener('loadedmetadata', () => {
        if (durationEl) durationEl.textContent = formatPlayerTime(audio.duration);
    });
}

// Speed control
if (speedBtn) {
    const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
    let currentSpeedIndex = 1;

    speedBtn.addEventListener('click', () => {
        currentSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
        const newSpeed = speeds[currentSpeedIndex];
        audio.playbackRate = newSpeed;
        speedText.textContent = `${newSpeed}x`;
    });
}

// Bulletin selector change
if (bulletinSelector) {
    bulletinSelector.addEventListener('change', (e) => {
        loadBulletin(e.target.value);
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize device ID first
    deviceId = getDeviceId();
    console.log('Device ID:', deviceId);

    // Load profiles and check for linked profile
    await loadProfiles();

    // Show onboarding if device has no linked profile
    await showOnboarding();

    // Load other data
    loadRecentFiles();
    loadStorageInfo();
    loadBulletinSelector();
});
