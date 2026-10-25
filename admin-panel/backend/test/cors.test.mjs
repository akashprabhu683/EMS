import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, allowedOrigins, corsOptions } from '../dist/corsConfig.js';

test('Admin CORS 1: Explicit production allowlist permits verified admin portal domains', () => {
  const verifiedOrigins = [
    'https://ems-admin-portal.vercel.app',
    'https://ems-admin-panel-provider.vercel.app',
    'https://ems-admin-panel-provider.netlify.app',
  ];

  for (const origin of verifiedOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, true);
    assert.equal(allowed, true, `Production origin ${origin} must be permitted`);
  }
});

test('Admin CORS 2: Reject unapproved browser origins in production', () => {
  const unapprovedOrigins = [
    'https://malicious-phishing.com',
    'https://fake-admin.com',
    'http://attacker-controlled.site',
    'https://ems-admin-portal.attacker.com',
  ];

  for (const origin of unapprovedOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, true);
    assert.equal(allowed, false, `Unapproved origin ${origin} must be rejected in production`);
  }
});

test('Admin CORS 3: Development mode allows localhost and local emulator workflows', () => {
  const devOrigins = [
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:3000',
  ];

  for (const origin of devOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, false);
    assert.equal(allowed, true, `Local dev origin ${origin} must be permitted in non-production`);
  }
});

test('Admin CORS 4: Origin-less requests (curl, server-to-server) pass CORS safely without being authenticated', () => {
  // 1. Passes CORS origin check
  const allowed = isAllowedOrigin(undefined, allowedOrigins, true);
  assert.equal(allowed, true, 'Requests omitting Origin header must pass CORS');

  // 2. Empty string origin also safely treated as origin-less
  assert.equal(isAllowedOrigin('', allowedOrigins, true), true);
});

test('Admin CORS 5: corsOptions callback produces Error on disallowed production origin and allows approved', (t, done) => {
  // Save current NODE_ENV
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    // 1. Disallowed origin triggers Error
    corsOptions.origin('https://evil-hacker.com', (err, allow) => {
      assert.ok(err instanceof Error, 'Disallowed origin must produce Error');
      assert.equal(err.message, 'Not allowed by CORS');

      // 2. Allowed origin passes with true
      corsOptions.origin('https://ems-admin-portal.vercel.app', (err2, allow2) => {
        assert.equal(err2, null);
        assert.equal(allow2, true);

        // 3. Server-to-server origin-less passes with true
        corsOptions.origin(undefined, (err3, allow3) => {
          assert.equal(err3, null);
          assert.equal(allow3, true);
          done();
        });
      });
    });
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});
