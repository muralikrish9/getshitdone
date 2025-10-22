console.log('[Google Auth] Module loaded');

let cachedToken = null;

export async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        const message = chrome.runtime.lastError?.message || 'Unknown error';
        console.error('[Google Auth] ✗ Failed to get token:', message);
        reject(new Error(message));
      } else {
        console.log('[Google Auth] ✓ Token obtained successfully');
        cachedToken = token;
        resolve(token);
      }
    });
  });
}

export async function revokeToken() {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive: false }, (token) => {
      if (token) {
        chrome.identity.removeCachedAuthToken({ token }, async () => {
          console.log('[Google Auth] Token removed from cache');

          try {
            await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
            console.log('[Google Auth] ✓ Token revoked on Google servers');
            cachedToken = null;
            resolve();
          } catch (error) {
            console.error('[Google Auth] ✗ Failed to revoke token:', error);
            reject(error);
          }
        });
      } else {
        console.log('[Google Auth] No token to revoke');
        resolve();
      }
    });
  });
}

export async function isSignedIn() {
  try {
    const token = await getAuthToken(false);
    return !!token;
  } catch (error) {
    return false;
  }
}

export async function getUserEmail() {
  try {
    const token = await getAuthToken(false);
    const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.error('[Google Auth] Failed to fetch user info, status:', response.status);
      // If token is invalid/expired, clear cached token so next interactive sign-in can refresh
      if (response.status === 401 && token) {
        chrome.identity.removeCachedAuthToken({ token });
        cachedToken = null;
      }
      return null;
    }

    const data = await response.json();
    console.log('[Google Auth] User email:', data.email);
    return data.email || null;
  } catch (error) {
    console.error('[Google Auth] Failed to get user email:', error);
    return null;
  }
}
