import test from 'node:test';
import assert from 'node:assert/strict';

// Helper to mock express req/res
function createMockReqRes({ headers = {}, query = {}, body = {}, params = {} } = {}) {
  const req = {
    headers,
    query,
    body,
    params,
    adminUser: undefined,
  };

  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
  };

  return { req, res };
}

test('Auth Middleware 1: Missing Authorization header is rejected with 401', async () => {
  const { req, res } = createMockReqRes();
  let nextCalled = false;

  // Dynamically import compiled admin route or test logic directly
  const { requireAdminAuth } = await import('../dist/routes/admin.js');
  await requireAdminAuth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.match(res.body.error, /Unauthorized: Missing or invalid Bearer token/i);
});

test('Auth Middleware 2: Non-Bearer scheme header is rejected with 401', async () => {
  const { req, res } = createMockReqRes({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
  let nextCalled = false;

  const { requireAdminAuth } = await import('../dist/routes/admin.js');
  await requireAdminAuth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.match(res.body.error, /Unauthorized: Missing or invalid Bearer token/i);
});

test('Auth Middleware 3: Malformed or unverified token is rejected with 401', async () => {
  const { req, res } = createMockReqRes({ headers: { authorization: 'Bearer invalid.jwt.token' } });
  let nextCalled = false;

  const { requireAdminAuth } = await import('../dist/routes/admin.js');
  await requireAdminAuth(req, res, () => { nextCalled = true; });

  assert.equal(res.statusCode, 401);
  assert.equal(nextCalled, false);
  assert.match(res.body.error, /Unauthorized/i);
});

test('Auth Middleware 4: Unverified email attempting superadmin access is rejected with 403 Forbidden', async () => {
  const { adminAuth } = await import('../dist/firebaseAdmin.js');
  const origVerify = adminAuth.verifyIdToken;

  try {
    adminAuth.verifyIdToken = async () => ({
      uid: 'fake_superadmin_unverified',
      email: 'akashprabhu0302@gmail.com',
      email_verified: false, // Unverified!
      admin: false,
    });

    const { req, res } = createMockReqRes({ headers: { authorization: 'Bearer valid.jwt.unverified' } });
    let nextCalled = false;

    const { requireAdminAuth } = await import('../dist/routes/admin.js');
    await requireAdminAuth(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
    assert.match(res.body.error, /Forbidden: Admin privilege required/i);
  } finally {
    adminAuth.verifyIdToken = origVerify;
  }
});

test('Auth Middleware 5: User without admin claims or database records is rejected with 403 Forbidden', async () => {
  const { adminAuth } = await import('../dist/firebaseAdmin.js');
  const origVerify = adminAuth.verifyIdToken;

  try {
    adminAuth.verifyIdToken = async () => ({
      uid: 'regular_customer_uid',
      email: 'customer@example.com',
      email_verified: true,
      admin: false,
    });

    const { req, res } = createMockReqRes({ headers: { authorization: 'Bearer customer.jwt.token' } });
    let nextCalled = false;

    const { requireAdminAuth } = await import('../dist/routes/admin.js');
    await requireAdminAuth(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 403);
    assert.equal(nextCalled, false);
    assert.match(res.body.error, /Forbidden: Admin privilege required/i);
  } finally {
    adminAuth.verifyIdToken = origVerify;
  }
});

test('Auth Middleware 6: Legitimate verified superadmin passes requireAdminAuth', async () => {
  const { adminAuth, adminDb } = await import('../dist/firebaseAdmin.js');
  const origVerify = adminAuth.verifyIdToken;
  const origCollection = adminDb.collection;

  try {
    adminAuth.verifyIdToken = async () => ({
      uid: 'legit_superadmin_uid',
      email: 'akashprabhu0302@gmail.com',
      email_verified: true,
      name: 'Primary Owner',
    });

    // Mock Firestore collection to guarantee test isolation from live database
    adminDb.collection = (colName) => {
      if (colName === 'admins') {
        return {
          doc: () => ({
            get: async () => ({ exists: true, data: () => ({ isActive: true }) }),
            set: async () => {},
          }),
          where: () => ({
            limit: () => ({
              get: async () => ({ empty: false, docs: [{ data: () => ({ isActive: true }) }] }),
            }),
          }),
        };
      }
      return origCollection.call(adminDb, colName);
    };

    const { req, res } = createMockReqRes({ headers: { authorization: 'Bearer superadmin.jwt.token' } });
    let nextCalled = false;

    const { requireAdminAuth } = await import('../dist/routes/admin.js');
    await requireAdminAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'Verified superadmin must pass middleware');
    assert.equal(req.adminUser.uid, 'legit_superadmin_uid');
    assert.equal(req.adminUser.email, 'akashprabhu0302@gmail.com');
  } finally {
    adminAuth.verifyIdToken = origVerify;
    adminDb.collection = origCollection;
  }
});
