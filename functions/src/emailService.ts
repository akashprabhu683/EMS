import * as logger from "firebase-functions/logger";

interface SendInviteEmailParams {
  toEmail: string;
  invitedBy: string;
  acceptUrl: string;
  expiresInDays?: number;
}

export async function sendAdminInvitationEmail(params: SendInviteEmailParams): Promise<{
  success: boolean;
  resendId?: string;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "EMS Dispensary <onboarding@resend.dev>";
  const { toEmail, invitedBy, acceptUrl, expiresInDays = 7 } = params;

  if (!apiKey) {
    logger.warn(
      `[Resend] RESEND_API_KEY is not set in Cloud Functions environment. Invitation generated for ${toEmail}. Accept URL: ${acceptUrl}`
    );
    return {
      success: true,
      error: "RESEND_API_KEY_NOT_CONFIGURED",
    };
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>EMS Dispensary Admin Invitation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { background: #047857; padding: 32px 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; }
    .header p { margin: 8px 0 0 0; opacity: 0.9; font-size: 14px; }
    .body { padding: 32px 24px; }
    .body p { font-size: 15px; line-height: 1.6; color: #334155; margin: 0 0 16px 0; }
    .highlight-box { background: #f0fdf4; border-left: 4px solid #10b981; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 14px; color: #065f46; }
    .btn-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #059669; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 10px; box-shadow: 0 2px 4px rgba(5,150,105,0.25); }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px; text-align: center; font-size: 12px; color: #64748b; }
    .link-alt { word-break: break-all; font-size: 12px; color: #059669; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🌿 EMS Dispensary</h1>
      <p>Ayurvedic & Natural Medicine Dispensary Management</p>
    </div>
    <div class="body">
      <p>Hello,</p>
      <p>You have been invited by <strong>${invitedBy}</strong> to join the <strong>EMS Dispensary Admin Portal</strong> as an Administrator.</p>
      
      <div class="highlight-box">
        <strong>Administrator Privileges:</strong> Manage counter click-and-collect orders, dispensary inventory stock, botanical medicine taxonomies, and store operations.
      </div>

      <p>To accept your invitation and activate your administrative access, click the button below:</p>

      <div class="btn-container">
        <a href="${acceptUrl}" class="btn" target="_blank">Accept Admin Invitation</a>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        This invitation link is valid for <strong>${expiresInDays} days</strong>. If the button above does not work, copy and paste this URL into your browser:
      </p>
      <p><a href="${acceptUrl}" class="link-alt">${acceptUrl}</a></p>
    </div>
    <div class="footer">
      If you were not expecting this invitation, you can safely ignore this email.
    </div>
  </div>
</body>
</html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: "🌿 You're invited to join EMS Dispensary Admin Portal",
        html,
      }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error("[Resend] API Error:", data);
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    logger.info(`[Resend] Invitation email successfully dispatched to ${toEmail}. Resend ID: ${data.id}`);
    return { success: true, resendId: data.id };
  } catch (err: any) {
    logger.error("[Resend] Failed to send email:", err);
    return { success: false, error: err.message };
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   CUSTOMER TRANSACTIONAL ORDER EMAILS
   ═══════════════════════════════════════════════════════════════════════ */

export interface SendOrderPlacedEmailParams {
  toEmail: string;
  customerName: string;
  orderId: string;
  pickupCode: string;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  totalPaise: number;
  pickupLocation: string;
}

export async function sendOrderPlacedEmail(params: SendOrderPlacedEmailParams): Promise<{
  success: boolean;
  resendId?: string;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "EMS Dispensary <orders@resend.dev>";
  const { toEmail, customerName, orderId, pickupCode, items, totalPaise, pickupLocation } = params;

  if (!apiKey) {
    logger.warn(
      `[Resend] RESEND_API_KEY is not set in Cloud Functions environment. Order confirmation email for ${toEmail} (Order #${orderId}) skipped.`
    );
    return { success: true, error: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  const itemsRows = items
    .map(
      (it) => `
    <tr>
      <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b;">
        <strong>${it.name}</strong> × ${it.quantity}
      </td>
      <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px; color: #1e293b; text-align: right; font-weight: 600;">
        ₹${((it.unitPrice * it.quantity) / 100).toFixed(2)}
      </td>
    </tr>`
    )
    .join("");

  const totalRupees = (totalPaise / 100).toFixed(2);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Order Confirmation #${orderId.slice(-6).toUpperCase()}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: #047857; padding: 28px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 22px; font-weight: 800;">🌿 EMS Herbal Dispensary</h1>
      <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Order Received — Click & Collect</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin: 0 0 20px 0;">
        Thank you for your order! We have received your Click-and-Collect request. Our dispensary staff is preparing your botanical remedies.
      </p>

      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0;">
        <span style="font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 1px;">Your Collection Verification Code</span>
        <div style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #065f46; font-family: monospace; margin: 8px 0;">${pickupCode}</div>
        <p style="margin: 0; font-size: 12px; color: #047857;">Please present this code at the dispensary counter when collecting.</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin: 24px 0 16px 0;">
        <thead>
          <tr>
            <th style="text-align: left; font-size: 12px; text-transform: uppercase; color: #64748b; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Item</th>
            <th style="text-align: right; font-size: 12px; text-transform: uppercase; color: #64748b; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
        <tfoot>
          <tr>
            <td style="padding: 12px 0 4px 0; font-size: 14px; font-weight: 700; color: #0f172a;">Total Payable at Counter</td>
            <td style="padding: 12px 0 4px 0; font-size: 18px; font-weight: 800; color: #047857; text-align: right;">₹${totalRupees}</td>
          </tr>
        </tfoot>
      </table>

      <div style="background: #f8fafc; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 13px; color: #334155;">
        <strong>Pickup Location:</strong><br>
        ${pickupLocation}
      </div>

      <p style="font-size: 12px; color: #64748b; margin-top: 24px;">
        Payment Note: No advance payment is charged online. Payment is settled via Cash or UPI at the store upon collection.
      </p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
      EMS Ayurvedic & Herbal Dispensary · Order #${orderId}
    </div>
  </div>
</body>
</html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `🌿 Order Confirmation #${orderId.slice(-6).toUpperCase()} — EMS Dispensary`,
        html,
      }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error("[Resend] Order placed email error:", data);
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    logger.info(`[Resend] Order placed email sent to ${toEmail}. ID: ${data.id}`);
    return { success: true, resendId: data.id };
  } catch (err: any) {
    logger.error("[Resend] Failed to send order placed email:", err);
    return { success: false, error: err.message };
  }
}

export interface SendOrderReadyEmailParams {
  toEmail: string;
  customerName: string;
  orderId: string;
  pickupCode: string;
  totalPaise: number;
  pickupLocation: string;
}

export async function sendOrderReadyForPickupEmail(params: SendOrderReadyEmailParams): Promise<{
  success: boolean;
  resendId?: string;
  error?: string;
}> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || "EMS Dispensary <orders@resend.dev>";
  const { toEmail, customerName, orderId, pickupCode, totalPaise, pickupLocation } = params;

  if (!apiKey) {
    logger.warn(
      `[Resend] RESEND_API_KEY is not set in Cloud Functions environment. Order ready email for ${toEmail} (Order #${orderId}) skipped.`
    );
    return { success: true, error: "RESEND_API_KEY_NOT_CONFIGURED" };
  }

  const totalRupees = (totalPaise / 100).toFixed(2);

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Order is Ready for Collection! #${orderId.slice(-6).toUpperCase()}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
    <div style="background: #059669; padding: 28px 24px; text-align: center; color: #ffffff;">
      <h1 style="margin: 0; font-size: 24px; font-weight: 800;">✓ Ready for Collection!</h1>
      <p style="margin: 6px 0 0 0; opacity: 0.95; font-size: 14px;">Your herbal remedies are packed and ready at the counter</p>
    </div>
    <div style="padding: 28px 24px;">
      <p style="font-size: 15px; margin: 0 0 16px 0;">Hello <strong>${customerName}</strong>,</p>
      <p style="font-size: 14px; line-height: 1.6; color: #334155; margin: 0 0 20px 0;">
        Great news! Your remedies for order <strong>#${orderId.slice(-6).toUpperCase()}</strong> have been prepared, inspected, and are now available for immediate pickup at the dispensary.
      </p>

      <div style="background: #ecfdf5; border: 2px dashed #059669; border-radius: 14px; padding: 22px; text-align: center; margin: 24px 0;">
        <span style="font-size: 12px; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 1.5px;">Counter Verification PIN</span>
        <div style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #065f46; font-family: monospace; margin: 10px 0;">${pickupCode}</div>
        <p style="margin: 0; font-size: 13px; font-weight: 600; color: #047857;">Show this PIN to our pharmacist at the counter</p>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin: 20px 0; font-size: 13px;">
        <div style="font-weight: 700; color: #1e293b; margin-bottom: 4px;">📍 Dispensary Location:</div>
        <div style="color: #475569;">${pickupLocation}</div>
        <div style="margin-top: 12px; font-weight: 700; color: #1e293b;">💵 Amount Due at Counter:</div>
        <div style="color: #047857; font-weight: 800; font-size: 16px;">₹${totalRupees} (Cash or UPI)</div>
      </div>

      <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin-top: 24px;">
        Please collect within 48 hours during store operating hours. If you need any assistance, feel free to visit or reply to this email.
      </p>
    </div>
    <div style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
      EMS Ayurvedic & Herbal Dispensary · Order #${orderId}
    </div>
  </div>
</body>
</html>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject: `✓ Ready for Pickup: Order #${orderId.slice(-6).toUpperCase()} — EMS Dispensary`,
        html,
      }),
    });

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error("[Resend] Order ready email error:", data);
      return { success: false, error: data.message || `HTTP ${res.status}` };
    }

    logger.info(`[Resend] Order ready email sent to ${toEmail}. ID: ${data.id}`);
    return { success: true, resendId: data.id };
  } catch (err: any) {
    logger.error("[Resend] Failed to send order ready email:", err);
    return { success: false, error: err.message };
  }
}

