// API Service Layer - centralizes all backend API calls
const getApiBaseUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    // On native mobile APK or Capacitor container, point to the computer's local IP address
    if (window.Capacitor || window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost') {
        return 'http://192.168.1.11:5000/api';
    }
    return '/api';
};

const API_BASE = getApiBaseUrl();

// Global memory cache to provide instantaneous load times across page navigations
export const globalCache = {
    chatList: null,
    chatMessages: {},
    matches: {},
    interests: { received: null, sent: null }
};

// Get auth token from localStorage
function getToken() {
    return localStorage.getItem('authToken');
}

// Set auth token
export function setToken(token) {
    localStorage.setItem('authToken', token);
}

// Remove auth token (logout)
export function removeToken() {
    localStorage.removeItem('authToken');
}

// Generic fetch wrapper with auth
async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
    };

    // If body is FormData, let browser set the content-type with boundary
    if (options.body instanceof FormData) {
        delete headers['Content-Type'];
    }

    let response;
    try {
        response = await fetch(`${API_BASE}${url}`, {
            cache: 'no-store', // Prevent browser from retrieving old payloads without asking server
            ...options,
            headers,
        });
    } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        throw new Error('Network error: Could not connect to server');
    }

    const contentType = response.headers.get('content-type');
    let data;

    if (contentType && contentType.includes('application/json')) {
        try {
            data = await response.json();
        } catch (jsonError) {
            console.error('JSON parse error:', jsonError);
            const text = await response.text();
            console.error('Response text:', text);
            throw new Error('Server returned invalid JSON response');
        }
    } else {
        const text = await response.text();
        console.error('Non-JSON response:', text);
        // If it's a 404 or something, the proxy might have returned an HTML page
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        data = { message: text };
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || `API request failed: ${response.status}`);
    }

    return data;
}

// ============ AUTH ============

export async function register(formData) {
    const data = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify(formData),
    });
    if (data.token) {
        setToken(data.token);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('uniqueId', data.user.uniqueId);
        localStorage.setItem('userProfile', JSON.stringify({
            ...formData,
            uniqueId: data.user.uniqueId,
            id: data.user.id
        }));
    }
    return data;
}

export async function login(username, password) {
    const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
    if (data.token) {
        setToken(data.token);
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('uniqueId', data.user.uniqueId);
        localStorage.setItem('userProfile', JSON.stringify({
            email: data.user.email,
            mobile: data.user.mobile,
            fullName: data.user.fullName,
            uniqueId: data.user.uniqueId,
            gender: data.user.gender,
            profileFor: data.user.profileFor
        }));
        // Store deactivation status
        if (data.isDeactivated) {
            localStorage.setItem('isDeactivated', 'true');
        } else {
            localStorage.removeItem('isDeactivated');
        }
    }
    return data;
}

export async function getCurrentUser() {
    return apiFetch('/auth/me');
}

export async function checkEmailAvailability(email) {
    return apiFetch('/auth/check-email', {
        method: 'POST',
        body: JSON.stringify({ email }),
    });
}

export async function checkMobileAvailability(mobile) {
    return apiFetch('/auth/check-mobile', {
        method: 'POST',
        body: JSON.stringify({ mobile }),
    });
}

export async function checkIdAvailability(uniqueId) {
    return apiFetch('/auth/check-id', {
        method: 'POST',
        body: JSON.stringify({ uniqueId }),
    });
}

export async function sendOtp(type, value) {
    return apiFetch('/auth/send-otp', {
        method: 'POST',
        body: JSON.stringify({ type, value }),
    });
}

export async function verifyOtp(value, otp) {
    const data = await apiFetch('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ value, otp }),
    });

    if (data.token) {
        setToken(data.token);
        localStorage.setItem('isLoggedIn', 'true');
        if (data.user) {
            localStorage.setItem('uniqueId', data.user.uniqueId);
            localStorage.setItem('userProfile', JSON.stringify(data.user));
        }
    }
    return data;
}

export async function resetPassword(value, otp, newPassword) {
    return apiFetch('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ value, otp, newPassword }),
    });
}

// ============ PROFILE ============

export async function getFullProfile() {
    const data = await apiFetch('/profile/full');
    // Sync all caches at once
    if (data.profile) {
        localStorage.setItem('userProfile', JSON.stringify(data.profile));
        localStorage.setItem('uniqueId', data.profile.uniqueId);
    }
    if (data.preferences) {
        localStorage.setItem('userPreferences', JSON.stringify(data.preferences));
    }
    if (data.favourites) {
        localStorage.setItem('userFavourites', JSON.stringify(data.favourites));
    }
    return data;
}

export async function getProfile() {
    const data = await apiFetch('/profile');
    // Sync with localStorage for backward compatibility
    localStorage.setItem('userProfile', JSON.stringify(data));
    localStorage.setItem('uniqueId', data.uniqueId);
    return data;
}

export async function updateProfile(profileData) {
    const data = await apiFetch('/profile', {
        method: 'PUT',
        body: JSON.stringify(profileData),
    });
    // Do NOT save partial editForm to localStorage here.
    // The caller should use getFullProfile() afterward to sync the cache correctly.
    return data;
}

export async function getProfileById(uniqueId) {
    return apiFetch(`/profile/${uniqueId}`);
}

export async function uploadPhoto(photoFile, isMain = false) {
    const formData = new FormData();
    formData.append('photo', photoFile);
    formData.append('isMain', isMain);

    return apiFetch('/profile/photo', {
        method: 'POST',
        body: formData,
    });
}

export async function deletePhoto(photoId) {
    return apiFetch(`/profile/photo/${photoId}`, {
        method: 'DELETE',
    });
}

export async function setMainPhoto(photoId) {
    return apiFetch(`/profile/photo/${photoId}/set-main`, {
        method: 'PUT',
    });
}

export async function syncPhotos(photos) {
    const formData = new FormData();
    const manifest = [];
    
    photos.forEach((photo, index) => {
        if (photo.file) {
            formData.append('photos', photo.file);
            manifest.push({ 
                isNew: true, 
                fileIndex: manifest.filter(m => m.isNew).length, 
                isMain: photo.isMain 
            });
        } else {
            manifest.push({ 
                isNew: false, 
                src: photo.src, 
                isMain: photo.isMain 
            });
        }
    });

    formData.append('photoManifest', JSON.stringify(manifest));

    return apiFetch('/profile/photos/sync', {
        method: 'PUT',
        body: formData,
    });
}

// ============ PREFERENCES ============

export async function getPreferences() {
    const data = await apiFetch('/preferences');
    localStorage.setItem('userPreferences', JSON.stringify(data));
    return data;
}

export async function updatePreferences(prefData) {
    const data = await apiFetch('/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefData),
    });
    localStorage.setItem('userPreferences', JSON.stringify(prefData));
    return data;
}

// ============ SEARCH ============

export async function searchProfiles(criteria) {
    return apiFetch('/search', {
        method: 'POST',
        body: JSON.stringify(criteria),
    });
}

export async function searchProfileById(uniqueId) {
    return apiFetch(`/search/id/${uniqueId}`);
}

export async function saveSearch(name, criteria) {
    return apiFetch('/search/save', {
        method: 'POST',
        body: JSON.stringify({ name, criteria }),
    });
}

export async function getSavedSearches() {
    return apiFetch('/search/saved');
}

export async function deleteSavedSearch(id) {
    return apiFetch(`/search/saved/${id}`, {
        method: 'DELETE',
    });
}

// ============ INTERESTS ============

export async function sendInterest(uniqueId, message = '') {
    return apiFetch(`/interests/send/${uniqueId}`, {
        method: 'POST',
        body: JSON.stringify({ message }),
    });
}

export async function respondToInterest(id, status) {
    return apiFetch(`/interests/${id}/respond`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
    });
}

export async function getReceivedInterests(filter = 'all') {
    return apiFetch(`/interests/received?filter=${filter}`);
}

export async function getSentInterests(filter = 'all') {
    return apiFetch(`/interests/sent?filter=${filter}`);
}

// ============ MATCHES ============

export async function getMatches() {
    return apiFetch('/matches');
}

export async function shortlistProfile(uniqueId) {
    return apiFetch(`/matches/shortlist/${uniqueId}`, {
        method: 'POST',
    });
}

export function removeFromShortlist(uniqueId) {
    return apiFetch(`/matches/shortlist/${uniqueId}`, {
        method: 'DELETE',
    });
}

export function ignoreProfile(uniqueId) {
    return apiFetch(`/matches/ignore/${uniqueId}`, {
        method: 'POST',
    });
}

export async function getShortlistedProfiles() {
    return apiFetch('/matches/shortlist');
}

export async function getViewedYou() {
    return apiFetch('/matches/viewed-you');
}

export async function getViewedByYou() {
    return apiFetch('/matches/viewed-by-you');
}

export async function getShortlistedYou() {
    return apiFetch('/matches/shortlisted-you');
}

export async function getNearbyMatches() {
    return apiFetch('/matches/nearby');
}

export async function getHoroscopeMatches() {
    return apiFetch('/matches/horoscope');
}

export async function getMatchesWithPhotos() {
    return apiFetch('/matches/with-photos');
}

export async function getEducationPreferenceMatches() {
    return apiFetch('/matches/education-preference');
}

// ============ FAVOURITES ============

export async function getFavourites() {
    const data = await apiFetch('/favourites');
    localStorage.setItem('userFavourites', JSON.stringify(data));
    return data;
}

export async function updateFavourites(favData) {
    const data = await apiFetch('/favourites', {
        method: 'PUT',
        body: JSON.stringify(favData),
    });
    localStorage.setItem('userFavourites', JSON.stringify(favData));
    return data;
}

// ============ NOTIFICATIONS ============

export async function getNotifications() {
    return apiFetch('/notifications');
}

// ============ SETTINGS ============

export async function verifyPassword(currentPassword) {
    return apiFetch('/settings/verify-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword }),
    });
}

export async function changePassword(currentPassword, newPassword, confirmPassword) {
    return apiFetch('/settings/change-password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
}

export async function deactivateProfile(duration) {
    return apiFetch('/settings/deactivate', {
        method: 'POST',
        body: JSON.stringify({ duration }),
    });
}

export async function activateProfile() {
    return apiFetch('/settings/activate', {
        method: 'POST',
    });
}

export async function getDeactivationStatus() {
    return apiFetch('/settings/deactivation-status');
}

export async function deleteProfile(reason, otherReason, confirmDelete) {
    return apiFetch('/settings/delete-profile', {
        method: 'POST',
        body: JSON.stringify({ reason, otherReason, confirmDelete }),
    });
}

export async function getIgnoredProfiles() {
    return apiFetch('/settings/ignored');
}

export async function removeFromIgnored(uniqueId) {
    return apiFetch(`/settings/ignored/${uniqueId}`, {
        method: 'DELETE',
    });
}

export async function getBlockedProfiles() {
    return apiFetch('/settings/blocked');
}

export async function blockProfile(uniqueId) {
    return apiFetch(`/settings/block/${uniqueId}`, {
        method: 'POST',
    });
}

export async function removeFromBlocked(uniqueId) {
    return apiFetch(`/settings/blocked/${uniqueId}`, {
        method: 'DELETE',
    });
}

// ============ CHAT ============

export async function startChat(uniqueId) {
    return apiFetch(`/chat/start/${uniqueId}`, {
        method: 'POST',
    });
}

export async function getChatList() {
    return apiFetch('/chat/chat-list');
}

export async function getChatMessages(uniqueId) {
    return apiFetch(`/chat/${uniqueId}`);
}

export async function sendChatMessage(uniqueId, content) {
    return apiFetch(`/chat/send/${uniqueId}`, {
        method: 'POST',
        body: JSON.stringify({ content }),
    });
}

export async function getChatUnreadCount() {
    return apiFetch('/chat/unread-count');
}

export async function editChatMessage(messageId, content) {
    return apiFetch(`/chat/edit/${messageId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
    });
}

export async function unsendChatMessage(messageId) {
    return apiFetch(`/chat/unsend/${messageId}`, {
        method: 'DELETE',
    });
}

// ============ LOGOUT ============

export function logout() {
    removeToken();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('uniqueId');
    localStorage.removeItem('userProfile');
    localStorage.removeItem('userPreferences');
    localStorage.removeItem('userFavourites');
    localStorage.removeItem('profileViewEvents');
    localStorage.removeItem('isDeactivated');
}

// ============ AUTH CHECK ============

export function isAuthenticated() {
    return !!getToken() && localStorage.getItem('isLoggedIn') === 'true';
}

