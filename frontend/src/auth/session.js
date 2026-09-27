import { isSupportedRole } from './roles.js';

export const AUTH_SESSION_KEY = 'convenience-store.auth.session';

function getBrowserStorage(name) {
  if (typeof window === 'undefined') return null;

  try {
    return window[name];
  } catch {
    return null;
  }
}

function isValidSession(session) {
  return Boolean(
    session
    && typeof session.accessToken === 'string'
    && session.accessToken.length > 0
    && session.user
    && isSupportedRole(session.user.role),
  );
}

function sanitizeSession(session) {
  if (!isValidSession(session)) throw new TypeError('Cannot persist an invalid auth session');

  const { user } = session;
  return {
    accessToken: session.accessToken,
    tokenType: session.tokenType === 'Bearer' ? 'Bearer' : undefined,
    user: {
      accountId: user.accountId,
      username: user.username,
      role: user.role,
      roleName: user.roleName,
      ownerType: user.ownerType,
      ownerId: user.ownerId,
      displayName: user.displayName,
    },
  };
}

function readFromStorage(storage) {
  if (!storage) return null;

  try {
    const rawValue = storage.getItem(AUTH_SESSION_KEY);
    if (!rawValue) return null;

    const session = JSON.parse(rawValue);
    if (isValidSession(session)) return session;
    storage.removeItem(AUTH_SESSION_KEY);
  } catch {
    try {
      storage.removeItem(AUTH_SESSION_KEY);
    } catch {
      // Storage may be unavailable because of browser privacy settings.
    }
  }

  return null;
}

export function loadStoredSession({
  localStore = getBrowserStorage('localStorage'),
  sessionStore = getBrowserStorage('sessionStorage'),
} = {}) {
  return readFromStorage(localStore) ?? readFromStorage(sessionStore);
}

export function persistSession(session, remember, {
  localStore = getBrowserStorage('localStorage'),
  sessionStore = getBrowserStorage('sessionStorage'),
} = {}) {
  const safeSession = sanitizeSession(session);

  const target = remember ? localStore : sessionStore;
  const other = remember ? sessionStore : localStore;
  other?.removeItem(AUTH_SESSION_KEY);
  target?.setItem(AUTH_SESSION_KEY, JSON.stringify(safeSession));
  return safeSession;
}

export function clearStoredSession({
  localStore = getBrowserStorage('localStorage'),
  sessionStore = getBrowserStorage('sessionStorage'),
} = {}) {
  localStore?.removeItem(AUTH_SESSION_KEY);
  sessionStore?.removeItem(AUTH_SESSION_KEY);
}
