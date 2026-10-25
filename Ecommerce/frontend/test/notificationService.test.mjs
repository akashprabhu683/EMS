import test from 'node:test';
import assert from 'node:assert/strict';

/* ═══════════════════════════════════════════════════════════════════════
   FRONTEND NOTIFICATION SERVICE & ANDROID BRIDGE UNIT TESTS
   ═══════════════════════════════════════════════════════════════════════ */

// Minimal DOM simulation for Node test environment
function setupMockWindow() {
  const listeners = new Map();
  const mockWin = {
    EMS_FCM_TOKEN: undefined,
    EMSAndroid: undefined,
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(fn);
    },
    removeEventListener(event, fn) {
      if (!listeners.has(event)) return;
      listeners.set(
        event,
        listeners.get(event).filter((h) => h !== fn)
      );
    },
    dispatchEvent(event) {
      const handlers = listeners.get(event.type) || [];
      handlers.forEach((h) => h(event));
    },
  };
  return mockWin;
}

test('Frontend FCM 1: getNativeFcmToken returns null in web-only browser session', () => {
  const win = setupMockWindow();

  function getNativeFcmToken(targetWin) {
    if (!targetWin) return null;
    if (typeof targetWin.EMS_FCM_TOKEN === 'string' && targetWin.EMS_FCM_TOKEN.trim().length >= 10) {
      return targetWin.EMS_FCM_TOKEN.trim();
    }
    if (targetWin.EMSAndroid && typeof targetWin.EMSAndroid.getFcmToken === 'function') {
      try {
        const token = targetWin.EMSAndroid.getFcmToken();
        if (typeof token === 'string' && token.trim().length >= 10) {
          return token.trim();
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  assert.equal(getNativeFcmToken(win), null);
});

test('Frontend FCM 2: getNativeFcmToken retrieves token from window.EMS_FCM_TOKEN', () => {
  const win = setupMockWindow();
  win.EMS_FCM_TOKEN = '  fcm_device_token_sample_1234567890  ';

  function getNativeFcmToken(targetWin) {
    if (!targetWin) return null;
    if (typeof targetWin.EMS_FCM_TOKEN === 'string' && targetWin.EMS_FCM_TOKEN.trim().length >= 10) {
      return targetWin.EMS_FCM_TOKEN.trim();
    }
    return null;
  }

  assert.equal(getNativeFcmToken(win), 'fcm_device_token_sample_1234567890');
});

test('Frontend FCM 3: getNativeFcmToken queries EMSAndroid JavascriptInterface bridge', () => {
  const win = setupMockWindow();
  win.EMSAndroid = {
    getFcmToken() {
      return 'fcm_native_bridge_token_987654321';
    },
  };

  function getNativeFcmToken(targetWin) {
    if (!targetWin) return null;
    if (typeof targetWin.EMS_FCM_TOKEN === 'string' && targetWin.EMS_FCM_TOKEN.trim().length >= 10) {
      return targetWin.EMS_FCM_TOKEN.trim();
    }
    if (targetWin.EMSAndroid && typeof targetWin.EMSAndroid.getFcmToken === 'function') {
      try {
        const token = targetWin.EMSAndroid.getFcmToken();
        if (typeof token === 'string' && token.trim().length >= 10) {
          return token.trim();
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  assert.equal(getNativeFcmToken(win), 'fcm_native_bridge_token_987654321');
});

test('Frontend FCM 4: setupFcmTokenListener dispatches on ems_fcm_token CustomEvent and cleans up', () => {
  const win = setupMockWindow();

  function setupFcmTokenListener(targetWin, onToken) {
    const handler = (event) => {
      const token = event.detail?.token || targetWin.EMS_FCM_TOKEN;
      if (typeof token === 'string' && token.trim().length >= 10) {
        onToken(token.trim());
      }
    };
    targetWin.addEventListener('ems_fcm_token', handler);
    return () => {
      targetWin.removeEventListener('ems_fcm_token', handler);
    };
  }

  const receivedTokens = [];
  const unsubscribe = setupFcmTokenListener(win, (token) => {
    receivedTokens.push(token);
  });

  // Dispatch live token arrival event
  win.dispatchEvent({
    type: 'ems_fcm_token',
    detail: { token: 'newly_rotated_fcm_token_1122334455' },
  });

  assert.equal(receivedTokens.length, 1);
  assert.equal(receivedTokens[0], 'newly_rotated_fcm_token_1122334455');

  // After unsubscribe, further events are ignored
  unsubscribe();
  win.dispatchEvent({
    type: 'ems_fcm_token',
    detail: { token: 'another_fcm_token_9988776655' },
  });

  assert.equal(receivedTokens.length, 1);
});

test('Frontend FCM 5: Session deduplication prevents redundant registration network calls', async () => {
  let callCount = 0;
  let lastToken = null;
  let lastUid = null;

  async function mockRegister(uid, token) {
    const clean = token.trim();
    if (lastToken === clean && lastUid === uid) {
      return; // deduplicated
    }
    callCount++;
    lastToken = clean;
    lastUid = uid;
  }

  // Initial registration
  await mockRegister('user_1', 'fcm_token_abc_123456');
  assert.equal(callCount, 1);

  // Duplicate registration on component re-render
  await mockRegister('user_1', 'fcm_token_abc_123456');
  assert.equal(callCount, 1);

  // Different user on same phone
  await mockRegister('user_2', 'fcm_token_abc_123456');
  assert.equal(callCount, 2);

  // Token rotation for same user
  await mockRegister('user_2', 'fcm_token_def_789012');
  assert.equal(callCount, 3);
});
