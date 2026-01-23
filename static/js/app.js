/**
 * News Bulletin Aggregator - Frontend JavaScript (Multi-Profile)
 */

// Global state
let currentProfileId = null;
let profiles = {};

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

// Load profiles from server
async function loadProfiles() {
    try {
        const response = await fetch('/api/profiles');
        const data = await response.json();

        currentProfileId = data.active_profile;
        profiles = data.profiles;

        return data;
    } catch (error) {
        showStatus('Error loading profiles: ' + error.message, 'error');
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

// Generate bulletin
async function generateBulletin() {
    try {
        // Disable button and show spinner
        generateBtn.disabled = true;
        generateBtn.querySelector('.btn-text').style.display = 'none';
        generateBtn.querySelector('.btn-spinner').style.display = 'inline-flex';

        // Show progress
        generationProgress.style.display = 'block';
        generationProgress.textContent = 'Fetching news bulletins from selected sources...';

        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (response.ok) {
            showStatus('Bulletin generated successfully!', 'success');
            generationProgress.textContent = `Generated: ${data.filename}`;

            // Refresh recent files list
            loadRecentFiles();
        } else {
            showStatus('Failed to generate bulletin: ' + data.message, 'error');
            generationProgress.style.display = 'none';
        }
    } catch (error) {
        showStatus('Error generating bulletin: ' + error.message, 'error');
        generationProgress.style.display = 'none';
    } finally {
        // Re-enable button and hide spinner
        generateBtn.disabled = false;
        generateBtn.querySelector('.btn-text').style.display = 'inline';
        generateBtn.querySelector('.btn-spinner').style.display = 'none';
    }
}

// Load recent files
async function loadRecentFiles() {
    try {
        const response = await fetch('/api/recent-files');
        const data = await response.json();

        if (response.ok && data.files && data.files.length > 0) {
            recentFilesList.innerHTML = data.files.map(file => `
                <div class="file-item">
                    <div class="file-info">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-meta">
                            ${formatFileSize(file.size)} • ${formatDate(file.modified)}
                        </div>
                    </div>
                    <div class="file-actions">
                        <button class="btn btn-email" data-filename="${file.filename}">
                            Email
                        </button>
                        <a href="/api/download/${file.filename}" class="btn btn-download" download>
                            Download
                        </a>
                    </div>
                </div>
            `).join('');
        } else {
            recentFilesList.innerHTML = '<p class="empty-text">No bulletins generated yet</p>';
        }
    } catch (error) {
        recentFilesList.innerHTML = '<p class="empty-text">Error loading files</p>';
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

saveNewProfileBtn.addEventListener('click', () => {
    const profileName = document.getElementById('new-profile-name').value.trim();

    if (!profileName) {
        showStatus('Please enter a profile name', 'error');
        return;
    }

    newProfileModal.style.display = 'none';
    createProfile(profileName);
});

// Delete source buttons and email buttons (delegated event handling)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-delete-source')) {
        const sourceName = e.target.dataset.source;
        deleteCustomSource(sourceName);
    }

    if (e.target.classList.contains('btn-email')) {
        const filename = e.target.dataset.filename;
        emailBulletin(filename);
    }
});

// Close modals on outside click
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
    }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    loadProfiles();
    loadRecentFiles();
});
