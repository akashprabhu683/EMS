import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedOrigin, allowedOrigins, corsOptions } from '../dist/corsConfig.js';

test('Ecommerce CORS 1: Explicit production allowlist permits verified storefront domains', () => {
  const verifiedOrigins = [
    'https://ecommerce-storefront-client.vercel.app',
    'https://ecommerce-storefront-client.netlify.app',
  ];

  for (const origin of verifiedOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, true);
    assert.equal(allowed, true, `Production origin ${origin} must be permitted`);
  }
});

test('Ecommerce CORS 2: Reject unapproved browser origins in production', () => {
  const unapprovedOrigins = [
    'https://malicious-phishing.com',
    'https://fake-store.com',
    'http://attacker-controlled.site',
    'https://ecommerce-storefront-client.attacker.com',
  ];

  for (const origin of unapprovedOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, true);
    assert.equal(allowed, false, `Unapproved origin ${origin} must be rejected in production`);
  }
});

test('Ecommerce CORS 3: Development mode allows localhost and local emulator workflows', () => {
  const devOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  for (const origin of devOrigins) {
    const allowed = isAllowedOrigin(origin, allowedOrigins, false);
    assert.equal(allowed, true, `Local dev origin ${origin} must be permitted in non-production`);
  }
});

test('Ecommerce CORS 4: Origin-less requests (native Android apps, curl) pass CORS safely without being authenticated', () => {
  // 1. Passes CORS origin check
  const allowed = isAllowedOrigin(undefined, allowedOrigins, true);
  assert.equal(allowed, true, 'Requests omitting Origin header (mobile apps, curl) must pass CORS');

  // 2. Empty string origin also safely treated as origin-less
  assert.equal(isAllowedOrigin('', allowedOrigins, true), true);
});

test('Ecommerce CORS 5: corsOptions callback produces Error on disallowed production origin and allows approved', (t, done) => {
  // Save current NODE_ENV
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  try {
    // 1. Disallowed origin triggers Error
    corsOptions.origin('https://evil-hacker.com', (err, allow) => {
      assert.ok(err instanceof Error, 'Disallowed origin must produce Error');
      assert.equal(err.message, 'Not allowed by CORS');

      // 2. Allowed origin passes with true
      corsOptions.origin('https://ecommerce-storefront-client.vercel.app', (err2, allow2) => {
        assert.equal(err2, null);
        assert.equal(allow2, true);

        // 3. Native app origin-less passes with true
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
