/**
 * Script to sync existing Firebase Auth users who have { admin: true }
 * into the Firestore `admins` collection so they appear in the UI.
 * 
 * Run: node scripts/sync-admin-users.mjs
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import os from 'os';

const PROJECT_ID = 'ems-store-6a342';

async function getAccessToken() {
  const firebaseToolsPath = join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  if (existsSync(firebaseToolsPath)) {
    try {
      const globalModules = [
        join(process.env.APPDATA || '', 'npm', 'node_modules', 'firebase-tools'),
        resolve('functions', 'node_modules', 'firebase-tools'),
      ];

      for (const modPath of globalModules) {
        if (existsSync(modPath)) {
          const auth = (await import('file:///' + join(modPath, 'lib', 'auth.js').replace(/\\/g, '/'))).default || (await import('file:///' + join(modPath, 'lib', 'auth.js').replace(/\\/g, '/')));
          const api = (await import('file:///' + join(modPath, 'lib', 'api.js').replace(/\\/g, '/'))).default || (await import('file:///' + join(modPath, 'lib', 'api.js').replace(/\\/g, '/')));

          const account = auth.getGlobalDefaultAccount();
          if (account?.tokens?.refresh_token) {
            const token = await auth.getAccessToken(account.tokens.refresh_token, api.getScopes());
            if (token?.access_token) return token.access_token;
          }
        }
      }
    } catch {
      // Fall through
    }
  }

  throw new Error('No valid Google Cloud / Firebase credentials found.');
}

async function syncAdminUsers() {
  try {
    const accessToken = await getAccessToken();

    // 1. Fetch user accounts
    const knownEmails = ['akashprabhu0302@gmail.com'];
    for (const email of knownEmails) {
      const lookupRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email: [email] }),
        }
      );

      const lookupData = await lookupRes.json();
      if (!lookupData.users || lookupData.users.length === 0) continue;

      const user = lookupData.users[0];
      const customAttrs = user.customAttributes ? JSON.parse(user.customAttributes) : {};

      if (customAttrs.admin) {
        // Write to Firestore admins/{uid} collection
        const docPayload = {
          fields: {
            uid: { stringValue: user.localId },
            email: { stringValue: user.email },
            displayName: { stringValue: user.displayName || user.email.split('@')[0] },
            role: { stringValue: 'admin' },
            grantedBy: { stringValue: 'initial_setup' },
            grantedAt: { timestampValue: new Date().toISOString() },
          },
        };

        const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/admins/${user.localId}`;
        const fsRes = await fetch(firestoreUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(docPayload),
        });

        if (fsRes.ok) {
          console.log(`Synced admin account to Firestore: ${user.email} (${user.localId})`);
        } else {
          console.error(`Failed to sync to Firestore: ${await fsRes.text()}`);
        }
      }
    }

    console.log('Admin sync finished successfully.');
  } catch (err) {
    console.error('Error syncing admins:', err.message || err);
  }
}

syncAdminUsers();
