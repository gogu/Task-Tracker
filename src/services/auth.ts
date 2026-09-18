import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

export interface StoredAuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export type AuthUser = User | StoredAuthUser;

export const TOKEN_STORAGE_KEY = 'media_tracker_google_access_token';
export const TOKEN_EXPIRY_KEY = 'media_tracker_google_token_expiry';
export const USER_STORAGE_KEY = 'media_tracker_google_user';

export const createGoogleProvider = (forceConsent = false) => {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach((scope) => provider.addScope(scope));
  if (forceConsent) {
    provider.setCustomParameters({
      prompt: 'consent',
    });
  } else {
    // Use select_account so Google remembers previous permission grant
    // without prompting for consent every time
    provider.setCustomParameters({
      prompt: 'select_account',
    });
  }
  return provider;
};

// In-memory token cache
let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const getStoredAccessToken = (): string | null => {
  try {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!token) return null;
    if (expiry && Date.now() > Number(expiry)) {
      // Expired token
      return null;
    }
    return token;
  } catch (e) {
    return null;
  }
};

export const getStoredUser = (): StoredAuthUser | null => {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse stored user:', e);
  }
  return null;
};

export const isTokenExpired = (): boolean => {
  try {
    const expiry = localStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiry) return true;
    return Date.now() > Number(expiry);
  } catch (e) {
    return true;
  }
};

export const initAuth = (
  onAuthSuccess?: (user: AuthUser, token: string) => void,
  onAuthFailure?: () => void
) => {
  // 1. Immediately restore state from localStorage if available
  const storedToken = getStoredAccessToken();
  if (storedToken) {
    cachedAccessToken = storedToken;
  }

  const storedUser = getStoredUser();
  if (storedUser && onAuthSuccess) {
    onAuthSuccess(storedUser, cachedAccessToken || '');
  }

  // 2. Listen to Firebase Auth state
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const activeToken = cachedAccessToken || getStoredAccessToken() || '';
      const userProfile: StoredAuthUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
      };
      try {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userProfile));
      } catch (e) {}

      if (onAuthSuccess) {
        onAuthSuccess(user, activeToken);
      }
    } else {
      if (!getStoredUser() && !getStoredAccessToken()) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    }
  });
};

export const googleSignIn = async (
  forceConsent: boolean = false
): Promise<{ user: AuthUser; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const provider = createGoogleProvider(forceConsent);
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('未能从 Google 登录凭据中获取 Drive 访问令牌 (Access Token)');
    }

    cachedAccessToken = credential.accessToken;
    try {
      // Save token (default expiry: 3500 seconds ~ 58 minutes)
      localStorage.setItem(TOKEN_STORAGE_KEY, credential.accessToken);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + 3500 * 1000));

      const userProfile: StoredAuthUser = {
        uid: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        photoURL: result.user.photoURL,
      };
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userProfile));
    } catch (e) {
      console.warn('Failed to save auth to localStorage:', e);
    }

    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken && !isTokenExpired()) {
    return cachedAccessToken;
  }
  const stored = getStoredAccessToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('Logout error:', e);
  }
  cachedAccessToken = null;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch (e) {}
};
