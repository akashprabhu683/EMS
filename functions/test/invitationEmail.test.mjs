import test from "node:test";
import assert from "node:assert/strict";
import { sendAdminInvitationEmail } from "../lib/emailService.js";

/* ═══════════════════════════════════════════════════════════════════════
   INVITATION EMAIL FAILURE & RECOVERY SUITE
   ═══════════════════════════════════════════════════════════════════════ */

test("Email 1: Missing RESEND_API_KEY returns explicit failure and does NOT claim success", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    const result = await sendAdminInvitationEmail({
      toEmail: "pharmacist@thangamstores.com",
      invitedBy: "akashprabhu0302@gmail.com",
      acceptUrl: "https://ems-admin-portal.vercel.app/accept-invite?token=secret123&email=pharmacist%40thangamstores.com",
    });

    assert.equal(result.success, false, "Must return success: false when RESEND_API_KEY is missing");
    assert.equal(result.error, "RESEND_API_KEY_NOT_CONFIGURED");
    assert.equal(result.resendId, undefined);
  } finally {
    if (originalKey) process.env.RESEND_API_KEY = originalKey;
  }
});

test("Email 2: Resend API HTTP error response returns explicit failure with provider error details", async () => {
  process.env.RESEND_API_KEY = "re_test_mock_key_12345";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return {
      ok: false,
      status: 403,
      json: async () => ({
        statusCode: 403,
        name: "invalid_api_key",
        message: "The API key provided is invalid or has been revoked.",
      }),
    };
  };

  try {
    const result = await sendAdminInvitationEmail({
      toEmail: "newadmin@thangamstores.com",
      invitedBy: "akashprabhu0302@gmail.com",
      acceptUrl: "https://ems-admin-portal.vercel.app/accept-invite?token=secret456&email=newadmin%40thangamstores.com",
    });

    assert.equal(result.success, false);
    assert.match(result.error, /invalid or has been revoked/i);
    assert.equal(result.resendId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
});

test("Email 3: Network exception / timeout during email delivery returns explicit failure", async () => {
  process.env.RESEND_API_KEY = "re_test_mock_key_12345";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("ETIMEDOUT: Connection to api.resend.com timed out after 10000ms");
  };

  try {
    const result = await sendAdminInvitationEmail({
      toEmail: "timeout@thangamstores.com",
      invitedBy: "akashprabhu0302@gmail.com",
      acceptUrl: "https://ems-admin-portal.vercel.app/accept-invite?token=secret789&email=timeout%40thangamstores.com",
    });

    assert.equal(result.success, false);
    assert.match(result.error, /ETIMEDOUT/);
    assert.equal(result.resendId, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
});

test("Email 4: Successful Resend email dispatch returns success: true and resendId", async () => {
  process.env.RESEND_API_KEY = "re_test_valid_key";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(opts.method, "POST");
    const body = JSON.parse(opts.body);
    assert.deepEqual(body.to, ["success@thangamstores.com"]);
    assert.match(body.html, /Accept Admin Invitation/);
    assert.match(body.subject, /You're invited to join EMS Dispensary Admin Portal/);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "msg_resend_9876543210",
      }),
    };
  };

  try {
    const result = await sendAdminInvitationEmail({
      toEmail: "success@thangamstores.com",
      invitedBy: "akashprabhu0302@gmail.com",
      acceptUrl: "https://ems-admin-portal.vercel.app/accept-invite?token=secretSuccess&email=success%40thangamstores.com",
    });

    assert.equal(result.success, true);
    assert.equal(result.resendId, "msg_resend_9876543210");
    assert.equal(result.error, undefined);
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
  }
});
