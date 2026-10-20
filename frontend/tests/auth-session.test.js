import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoleHomePath, isSupportedRole } from '../src/auth/roles.js';
import {
  AUTH_SESSION_KEY,
  clearStoredSession,
  loadStoredSession,
  persistSession,
} from '../src/auth/session.js';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function createSession(overrides = {}) {
  return {
    accessToken: 'signed-token',
    tokenType: 'Bearer',
    password: 'must-not-be-stored',
    user: {
      accountId: 12,
      username: 'customer@example.test',
      role: 'CUSTOMER',
      displayName: 'Khách hàng thử nghiệm',
      password: 'also-must-not-be-stored',
    },
    ...overrides,
  };
}

test('remembered sessions use local storage and contain no password fields', () => {
  const localStore = createStorage();
  const sessionStore = createStorage();
  sessionStore.setItem(AUTH_SESSION_KEY, JSON.stringify(createSession()));

  const safeSession = persistSession(createSession(), true, { localStore, sessionStore });
  const raw = localStore.getItem(AUTH_SESSION_KEY);

  assert.equal(sessionStore.getItem(AUTH_SESSION_KEY), null);
  assert.equal(raw.includes('password'), false);
  assert.equal(Object.hasOwn(safeSession, 'password'), false);
  assert.equal(Object.hasOwn(safeSession.user, 'password'), false);
  assert.equal(loadStoredSession({ localStore, sessionStore }).user.role, 'CUSTOMER');
});

test('non-remembered sessions use session storage and logout clears both stores', () => {
  const localStore = createStorage();
  const sessionStore = createStorage();

  persistSession(createSession(), false, { localStore, sessionStore });
  assert.equal(localStore.getItem(AUTH_SESSION_KEY), null);
  assert.ok(sessionStore.getItem(AUTH_SESSION_KEY));

  clearStoredSession({ localStore, sessionStore });
  assert.equal(localStore.getItem(AUTH_SESSION_KEY), null);
  assert.equal(sessionStore.getItem(AUTH_SESSION_KEY), null);
});

test('invalid persisted data is discarded', () => {
  const localStore = createStorage();
  const sessionStore = createStorage();
  localStore.setItem(AUTH_SESSION_KEY, '{not-json');
  sessionStore.setItem(AUTH_SESSION_KEY, JSON.stringify(createSession({ accessToken: '' })));

  assert.equal(loadStoredSession({ localStore, sessionStore }), null);
  assert.equal(localStore.getItem(AUTH_SESSION_KEY), null);
  assert.equal(sessionStore.getItem(AUTH_SESSION_KEY), null);
});

test('all four roles have their own landing path', () => {
  assert.equal(getRoleHomePath('CUSTOMER'), '/customer');
  assert.equal(getRoleHomePath('CASHIER'), '/cashier');
  assert.equal(getRoleHomePath('WAREHOUSE'), '/warehouse');
  assert.equal(getRoleHomePath('MANAGER'), '/manager');
  assert.equal(isSupportedRole('INVENTORY'), false);
});
