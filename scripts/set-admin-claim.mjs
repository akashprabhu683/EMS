/**
 * Script to assign admin custom claims to a Firebase Authentication user.
 * 
 * Works seamlessly from any directory:
 *   node scripts/set-admin-claim.mjs <user-email-or-uid>
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import os from 'os';

const identifier = process.argv[2];

if (!identifier) {
  console.error('Error: Please provide a user email or Firebase UID.');
  console.log('Usage: node scripts/set-admin-claim.mjs <user-email-or-uid>');
  process.exit(1);
}

const PROJECT_ID = 'ems-store-6a342';

async function getAccessToken() {
  // Option 1: Firebase CLI credentials
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

  throw new Error(
    'No valid Google Cloud / Firebase credentials found. Please run `firebase login` or provide a serviceAccountKey.json.'
  );
}

async function setAdminClaim() {
  try {
    const accessToken = await getAccessToken();

    // 1. Lookup user by email or localId
    const isEmail = identifier.includes('@');
    const lookupBody = isEmail ? { email: [identifier.trim()] } : { localId: [identifier.trim()] };

    const lookupRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:lookup`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(lookupBody),
      }
    );

    const lookupData = await lookupRes.json();
    if (!lookupData.users || lookupData.users.length === 0) {
      console.error(`User "${identifier}" not found in Firebase Authentication for project "${PROJECT_ID}".`);
      process.exit(1);
    }

    const user = lookupData.users[0];
    const existingClaims = user.customAttributes ? JSON.parse(user.customAttributes) : {};

    // 2. Set admin claim: true
    const updatedClaims = { ...existingClaims, admin: true };
    const updateRes = await fetch(
      `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:update`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          localId: user.localId,
          customAttributes: JSON.stringify(updatedClaims),
        }),
      }
    );

    const updateData = await updateRes.json();
    if (updateData.error) {
      throw new Error(updateData.error.message || JSON.stringify(updateData.error));
    }

    console.log(`\n Successfully granted admin privileges to:`);
    console.log(`- Email: ${user.email}`);
    console.log(`- Name:  ${user.displayName || 'N/A'}`);
    console.log(`- UID:   ${user.localId}`);
    console.log(`- Claim: { admin: true }\n`);
    console.log('You can now log in at http://localhost:5174/login (or click "Check Privileges" if already signed in).');
  } catch (error) {
    console.error('Failed to set admin claim:', error.message || error);
    process.exit(1);
  }
}

setAdminClaim();
