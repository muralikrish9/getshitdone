// Google Authentication Module using Google OAuth 2.0
// Handles OAuth2 authentication with Google services

class GoogleAuth {
    constructor() {
        this.isAuthenticated = false;
        this.accessToken = null;
        this.userInfo = null;
        this.clientId = 'YOUR_GOOGLE_CLIENT_ID';
        this.redirectUri = 'YOUR_GOOGLE_REDIRECT_URI';
        this.clientSecret = 'YOUR_GOOGLE_CLIENT_SECRET';
        this.scopes = [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/tasks',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
        ];

        console.log('[GoogleAuth] Redirect URI:', this.redirectUri);
    }

    /**
     * Authenticate with Google using OAuth 2.0 flow
     * @returns {Promise<{success: boolean, token?: string, error?: string}>}
     */
    async authenticate() {
        try {
            console.log('[GoogleAuth] Starting OAuth 2.0 authentication...');

            // Step 1: Get authorization code
            const authUrl = this.buildAuthUrl();
            console.log('[GoogleAuth] Opening auth URL:', authUrl);

            const authCode = await this.getAuthCode(authUrl);
            if (!authCode) {
                throw new Error('No authorization code received');
            }

            console.log('[GoogleAuth] Authorization code received');

            // Step 2: Exchange code for access token
            const tokenData = await this.exchangeCodeForToken(authCode);
            if (!tokenData.access_token) {
                throw new Error('No access token received from Google');
            }

            this.accessToken = tokenData.access_token;
            this.isAuthenticated = true;

            console.log('[GoogleAuth] Access token received, length:', this.accessToken.length);

            // Step 3: Get user info to verify token
            console.log('[GoogleAuth] Getting user info...');
            const userInfo = await this.getUserInfo();
            this.userInfo = userInfo;

            // Store auth state in Chrome storage
            await chrome.storage.local.set({
                googleAuth: {
                    isAuthenticated: true,
                    accessToken: this.accessToken,
                    refreshToken: tokenData.refresh_token,
                    userInfo: userInfo,
                    authenticatedAt: new Date().toISOString()
                }
            });

            console.log('[GoogleAuth] ✓ Authentication successful');
            return { success: true, token: this.accessToken, userInfo };

        } catch (error) {
            console.error('[GoogleAuth] ✗ Authentication failed:', error);
            this.isAuthenticated = false;
            this.accessToken = null;
            return { success: false, error: error.message };
        }
    }

    /**
     * Build OAuth authorization URL
     * @returns {string}
     */
    buildAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scopes.join(' '),
            access_type: 'offline',
            prompt: 'consent'
        });

        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    /**
     * Get authorization code from OAuth flow
     * @param {string} authUrl 
     * @returns {Promise<string>}
     */
    async getAuthCode(authUrl) {
        return new Promise((resolve, reject) => {
            chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            }, (responseUrl) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }

                try {
                    const url = new URL(responseUrl);
                    const code = url.searchParams.get('code');
                    const error = url.searchParams.get('error');

                    if (error) {
                        reject(new Error(`OAuth error: ${error}`));
                        return;
                    }

                    resolve(code);
                } catch (error) {
                    reject(new Error('Failed to parse authorization response'));
                }
            });
        });
    }

    /**
     * Exchange authorization code for access token
     * @param {string} code 
     * @returns {Promise<Object>}
     */
    async exchangeCodeForToken(code) {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Token exchange failed: ${response.status} - ${errorData.error_description || response.statusText}`);
        }

        return response.json();
    }

    /**
     * Get current access token (from cache or refresh if needed)
     * @returns {Promise<string|null>}
     */
    async getAccessToken() {
        try {
            // First check if we have a cached token
            const result = await chrome.storage.local.get(['googleAuth']);
            const authData = result.googleAuth;

            if (authData && authData.isAuthenticated && authData.accessToken) {
                // Verify token is still valid by making a test API call
                const isValid = await this.validateToken(authData.accessToken);
                if (isValid) {
                    this.accessToken = authData.accessToken;
                    this.isAuthenticated = true;
                    this.userInfo = authData.userInfo;
                    return authData.accessToken;
                } else if (authData.refreshToken) {
                    // Try to refresh the token
                    console.log('[GoogleAuth] Token expired, attempting refresh...');
                    try {
                        const newTokenData = await this.refreshAccessToken(authData.refreshToken);
                        this.accessToken = newTokenData.access_token;
                        this.isAuthenticated = true;

                        // Update storage with new token
                        await chrome.storage.local.set({
                            googleAuth: {
                                ...authData,
                                accessToken: newTokenData.access_token,
                                refreshToken: newTokenData.refresh_token || authData.refreshToken,
                                authenticatedAt: new Date().toISOString()
                            }
                        });

                        return this.accessToken;
                    } catch (refreshError) {
                        console.error('[GoogleAuth] Token refresh failed:', refreshError);
                        // Clear invalid auth data
                        await chrome.storage.local.remove(['googleAuth']);
                        return null;
                    }
                }
            }

            return null;
        } catch (error) {
            console.error('[GoogleAuth] Failed to get access token:', error);
            return null;
        }
    }

    /**
     * Refresh access token using refresh token
     * @param {string} refreshToken 
     * @returns {Promise<Object>}
     */
    async refreshAccessToken(refreshToken) {
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Token refresh failed: ${response.status} - ${errorData.error_description || response.statusText}`);
        }

        return response.json();
    }

    /**
     * Validate if token is still valid
     * @param {string} token 
     * @returns {Promise<boolean>}
     */
    async validateToken(token) {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.ok;
        } catch (error) {
            console.error('[GoogleAuth] Token validation failed:', error);
            return false;
        }
    }

    /**
     * Get user information
     * @returns {Promise<Object>}
     */
    async getUserInfo() {
        if (!this.accessToken) {
            throw new Error('No access token available');
        }

        try {
            // Use Bearer token in Authorization header
            const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Failed to get user info: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const userInfo = await response.json();
            console.log('[GoogleAuth] User info retrieved:', userInfo);
            return userInfo;
        } catch (error) {
            console.error('[GoogleAuth] Failed to get user info:', error);
            throw error;
        }
    }

    /**
     * Check if user is currently authenticated
     * @returns {Promise<boolean>}
     */
    async isUserAuthenticated() {
        try {
            const token = await this.getAccessToken();
            return !!token;
        } catch (error) {
            console.error('[GoogleAuth] Auth check failed:', error);
            return false;
        }
    }

    /**
     * Sign out and revoke token
     * @returns {Promise<boolean>}
     */
    async signOut() {
        try {
            console.log('[GoogleAuth] Signing out...');

            if (this.accessToken) {
                // Revoke the token with Google
                try {
                    await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, {
                        method: 'POST'
                    });
                    console.log('[GoogleAuth] Token revoked with Google');
                } catch (revokeError) {
                    console.warn('[GoogleAuth] Token revocation failed (non-critical):', revokeError);
                }
            }

            // Clear local state
            this.isAuthenticated = false;
            this.accessToken = null;
            this.userInfo = null;

            // Clear storage
            await chrome.storage.local.remove(['googleAuth']);

            console.log('[GoogleAuth] ✓ Sign out successful');
            return true;
        } catch (error) {
            console.error('[GoogleAuth] ✗ Sign out failed:', error);
            return false;
        }
    }

    /**
     * Get authentication status
     * @returns {Promise<{isAuthenticated: boolean, userInfo?: Object}>}
     */
    async getAuthStatus() {
        try {
            const result = await chrome.storage.local.get(['googleAuth']);
            const authData = result.googleAuth;

            if (authData && authData.isAuthenticated) {
                // Verify token is still valid
                const isValid = await this.validateToken(authData.accessToken);
                if (isValid) {
                    return {
                        isAuthenticated: true,
                        userInfo: authData.userInfo
                    };
                }
            }

            return { isAuthenticated: false };
        } catch (error) {
            console.error('[GoogleAuth] Failed to get auth status:', error);
            return { isAuthenticated: false };
        }
    }
}

// Create global instance
const googleAuth = new GoogleAuth();