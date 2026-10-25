/**
 * Migration Script: Backfill and Audit Category Slugs
 *
 * Scans all Firestore categories:
 * 1. Audits slugs for formatting compliance (/^[a-z0-9]+(?:-[a-z0-9]+)*$/).
 * 2. Detects duplicate slugs across category documents.
 * 3. Inspects /category_slugs collection for matching locks vs ownership conflicts.
 * 4. Identifies strictly eligible candidate slugs for reservation (valid format, unique, unreserved).
 * 5. Runs in DRY-RUN mode by default. Only commits writes if --apply flag is provided.
 *
 * DO NOT RUN AGAINST PRODUCTION WITHOUT PRIOR AUTHORIZATION.
 */

import admin from 'firebase-admin';

export interface SlugAuditResult {
  validCount: number;
  totalCategories: number;
  eligibleCandidates: Array<{ categoryId: string; slug: string; name: string }>;
  matchingLocks: Array<{ categoryId: string; slug: string; name: string }>;
  ownershipConflicts: Array<{
    categoryId: string;
    categoryName: string;
    slug: string;
    lockedToCategoryId: string;
  }>;
  duplicateConflicts: Map<string, Array<{ id: string; name: string }>>;
  malformed: Array<{ id: string; name: string; slug: string; suggested: string }>;
  orphanedLocks: Array<{ slug: string; lockedToCategoryId: string }>;
  appliedCandidates?: Array<{ categoryId: string; slug: string; name: string }>;
  skippedCandidates?: Array<{ categoryId: string; slug: string; name: string; reason: string }>;
  idempotentCandidates?: Array<{ categoryId: string; slug: string; name: string }>;
  conflictingCandidates?: Array<{ categoryId: string; slug: string; name: string; reason: string }>;
}

export interface MigrationOptions {
  db?: FirebaseFirestore.Firestore;
  isApply?: boolean;
  projectId?: string;
  requireEmulator?: boolean;
  allowProduction?: boolean;
  beforeApply?: () => Promise<void> | void;
}

export function sanitizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

export async function auditAndBackfillCategorySlugs(options?: MigrationOptions): Promise<SlugAuditResult> {
  const isApply = options?.isApply !== undefined ? options.isApply : process.argv.includes('--apply');
  const cliProjectArg = process.argv.find((a) => a.startsWith('--project='))?.split('=')[1];
  const projectId = options?.projectId || cliProjectArg || process.env.GCLOUD_PROJECT || 'ems-store-6a342';
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;

  // Safeguard: By default, ALL script executions require emulator isolation to protect production data
  const allowProduction = options?.allowProduction || process.argv.includes('--production') || process.env.EMS_ALLOW_PRODUCTION === 'true';

  if (!emulatorHost && !allowProduction) {
    throw new Error(
      `SAFETY ABORT: FIRESTORE_EMULATOR_HOST is not set for target project "${projectId}". Scripts require emulator isolation by default to protect production data. Pass --production or set EMS_ALLOW_PRODUCTION="true" to allow cloud connections.`
    );
  }

  // Live mutation safeguard against cloud Firestore
  if (isApply && !emulatorHost && process.env.EMS_ALLOW_PRODUCTION_MUTATION !== 'true') {
    throw new Error(
      'PRODUCTION SAFETY LOCK: Live mutations against cloud Firestore require EMS_ALLOW_PRODUCTION_MUTATION="true". Aborted.'
    );
  }

  let db: FirebaseFirestore.Firestore;
  if (options?.db) {
    db = options.db;
  } else {
    if (!admin.apps.length) {
      admin.initializeApp({ projectId });
    }
    db = admin.firestore();
  }

  console.log(`[Category Slugs Audit] Mode: ${isApply ? 'APPLY (Live Mutation)' : 'DRY-RUN (Audit Only)'}`);
  console.log(`[Category Slugs Audit] Project: ${projectId}`);
  console.log(`[Category Slugs Audit] Environment: ${emulatorHost ? `Emulator (${emulatorHost})` : 'Cloud Firestore'}`);

  const [categoriesSnap, slugLocksSnap] = await Promise.all([
    db.collection('categories').get(),
    db.collection('category_slugs').get(),
  ]);

  const existingLocksMap = new Map<string, string>(); // slug -> categoryId
  slugLocksSnap.forEach((doc) => {
    const data = doc.data();
    existingLocksMap.set(doc.id, data.categoryId || '');
  });

  const slugToCategories = new Map<string, Array<{ id: string; name: string }>>();
  const categoryRecords: Array<{ id: string; name: string; slug: string; isValidSlug: boolean }> = [];
  const malformed: Array<{ id: string; name: string; slug: string; suggested: string }> = [];

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  // 1. First pass: format validation and grouping
  categoriesSnap.forEach((doc) => {
    const data = doc.data();
    const id = doc.id;
    const name = String(data.name || id);
    const slug = String(data.slug || id).trim();
    const isValidSlug = slugRegex.test(slug);

    if (!isValidSlug) {
      malformed.push({ id, name, slug, suggested: sanitizeSlug(slug || name) });
    }

    if (!slugToCategories.has(slug)) {
      slugToCategories.set(slug, []);
    }
    slugToCategories.get(slug)!.push({ id, name });

    categoryRecords.push({ id, name, slug, isValidSlug });
  });

  // 2. Identify duplicate slug conflicts
  const duplicateConflicts = new Map<string, Array<{ id: string; name: string }>>();
  for (const [slug, cats] of slugToCategories.entries()) {
    if (cats.length > 1) {
      duplicateConflicts.set(slug, cats);
    }
  }

  // 3. Second pass: accurate classification
  const eligibleCandidates: Array<{ categoryId: string; slug: string; name: string }> = [];
  const matchingLocks: Array<{ categoryId: string; slug: string; name: string }> = [];
  const ownershipConflicts: Array<{
    categoryId: string;
    categoryName: string;
    slug: string;
    lockedToCategoryId: string;
  }> = [];

  for (const cat of categoryRecords) {
    const { id, name, slug, isValidSlug } = cat;

    // Check if this slug already has an existing reservation lock in /category_slugs
    if (existingLocksMap.has(slug)) {
      const lockedToCategoryId = existingLocksMap.get(slug) || '';
      if (lockedToCategoryId === id) {
        matchingLocks.push({ categoryId: id, slug, name });
      } else {
        ownershipConflicts.push({
          categoryId: id,
          categoryName: name,
          slug,
          lockedToCategoryId,
        });
      }
      continue;
    }

    // Slugs with no existing lock
    // A. If malformed -> requires manual formatting in /categories; never eligible
    if (!isValidSlug) {
      continue;
    }

    // B. If duplicate conflict -> requires manual disambiguation; never eligible
    if (duplicateConflicts.has(slug)) {
      continue;
    }

    // C. Valid format, unique, and unreserved -> ELIGIBLE CANDIDATE
    eligibleCandidates.push({ categoryId: id, slug, name });
  }

  // 4. Check for orphaned locks in /category_slugs
  const orphanedLocks: Array<{ slug: string; lockedToCategoryId: string }> = [];
  for (const [slug, lockedToCategoryId] of existingLocksMap.entries()) {
    if (!slugToCategories.has(slug)) {
      orphanedLocks.push({ slug, lockedToCategoryId });
    }
  }

  // 5. Audit Summary Output
  console.log('─────────────────────────────────────────────────────────────────');
  console.log(`Total Categories Scanned:       ${categoriesSnap.size}`);
  console.log(`Eligible Candidates to Reserve: ${eligibleCandidates.length}`);
  console.log(`Matching Existing Locks:        ${matchingLocks.length}`);
  console.log(`Lock Ownership Conflicts:       ${ownershipConflicts.length}`);
  console.log(`Duplicate Slug Conflicts:       ${duplicateConflicts.size}`);
  console.log(`Malformed Slugs:                ${malformed.length}`);
  console.log(`Orphaned Slug Locks:            ${orphanedLocks.length}`);
  console.log('─────────────────────────────────────────────────────────────────');

  // Detailed breakdowns
  if (eligibleCandidates.length > 0) {
    console.log('\n[*] Eligible Candidates for Reservation (Will be locked if --apply is passed):');
    for (const c of eligibleCandidates) {
      console.log(`  - Category "${c.name}" (ID: ${c.categoryId}) -> Reserve slug "${c.slug}"`);
    }
  } else {
    console.log('\n[*] No eligible candidate slugs require reservation.');
  }

  if (malformed.length > 0) {
    console.warn('\n[!] Malformed Slugs (Manual correction required in /categories — will NOT be reserved):');
    for (const m of malformed) {
      console.warn(`  - Category "${m.name}" (ID: ${m.id}): current "${m.slug}" -> suggested "${m.suggested}"`);
    }
  }

  if (duplicateConflicts.size > 0) {
    console.error('\n[!] Duplicate Slug Conflicts (Manual resolution required — will NOT be reserved):');
    for (const [slug, cats] of duplicateConflicts.entries()) {
      console.error(`  - Slug "${slug}" shared by ${cats.length} categories:`);
      for (const c of cats) {
        console.error(`      ID: ${c.id}, Name: "${c.name}"`);
      }
    }
  }

  if (ownershipConflicts.length > 0) {
    console.error('\n[!] Lock Ownership Conflicts (Manual resolution required — will NOT be overwritten):');
    for (const o of ownershipConflicts) {
      console.error(
        `  - Slug "${o.slug}" used by category "${o.categoryName}" (ID: ${o.categoryId}) is locked to category ID: "${o.lockedToCategoryId}"`
      );
    }
  }

  if (orphanedLocks.length > 0) {
    console.warn('\n[?] Orphaned Slug Locks in /category_slugs (No category currently uses this slug):');
    for (const orph of orphanedLocks) {
      console.warn(`  - Slug "${orph.slug}" (Locked to categoryId: "${orph.lockedToCategoryId}")`);
    }
  }

  const appliedCandidates: Array<{ categoryId: string; slug: string; name: string }> = [];
  const skippedCandidates: Array<{ categoryId: string; slug: string; name: string; reason: string }> = [];
  const idempotentCandidates: Array<{ categoryId: string; slug: string; name: string }> = [];
  const conflictingCandidates: Array<{ categoryId: string; slug: string; name: string; reason: string }> = [];

  // 6. Apply Execution (Only when --apply is explicitly specified and eligibleCandidates exist)
  if (isApply) {
    if (eligibleCandidates.length > 0) {
      console.log(`\n[APPLY] Committing ${eligibleCandidates.length} slug lock(s) to /category_slugs transactionally...`);

      if (options?.beforeApply) {
        await options.beforeApply();
      }

      for (const c of eligibleCandidates) {
        const catRef = db.collection('categories').doc(c.categoryId);
        const lockRef = db.collection('category_slugs').doc(c.slug);

        try {
          const outcome = await db.runTransaction(async (transaction) => {
            // Read both documents before any writes
            const [catSnap, lockSnap] = await Promise.all([
              transaction.get(catRef),
              transaction.get(lockRef),
            ]);

            // Skip if category was deleted concurrently
            if (!catSnap.exists) {
              return {
                type: 'skipped' as const,
                reason: `Category "${c.name}" (ID: ${c.categoryId}) no longer exists.`,
              };
            }

            const currentCatData = catSnap.data() || {};
            const currentCatSlug = String(currentCatData.slug || '').trim();

            // Skip if current category slug no longer matches candidate slug
            if (currentCatSlug !== c.slug) {
              return {
                type: 'skipped' as const,
                reason: `Category "${c.name}" (ID: ${c.categoryId}) slug changed concurrently from "${c.slug}" to "${currentCatSlug}". Skipping stale reservation.`,
              };
            }

            // Check existing lock consistency
            if (lockSnap.exists) {
              const lockData = lockSnap.data() || {};
              const lockedCategoryId = String(lockData.categoryId || '').trim();
              const lockedSlug = String(lockData.slug || lockSnap.id).trim();

              if (lockedCategoryId === c.categoryId && lockedSlug === c.slug) {
                return {
                  type: 'idempotent' as const,
                };
              }

              throw new Error(
                `CONCURRENCY CONFLICT: Slug lock "/category_slugs/${c.slug}" is locked to categoryId "${lockedCategoryId}" (expected "${c.categoryId}").`
              );
            }

            // Write reservation only after all validations pass
            transaction.set(lockRef, {
              categoryId: c.categoryId,
              slug: c.slug,
              backfilledAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            return {
              type: 'applied' as const,
            };
          });

          // Post-transaction reporting (free of retry side-effects)
          if (outcome.type === 'applied') {
            appliedCandidates.push(c);
            console.log(`  [+] Successfully reserved slug "${c.slug}" for category "${c.name}" (${c.categoryId}).`);
          } else if (outcome.type === 'skipped') {
            skippedCandidates.push({ ...c, reason: outcome.reason });
            console.warn(`  [!] Skipped candidate "${c.slug}": ${outcome.reason}`);
          } else if (outcome.type === 'idempotent') {
            idempotentCandidates.push(c);
            console.log(`  [=] Slug "${c.slug}" already consistently reserved for category "${c.categoryId}" (idempotent).`);
          }
        } catch (err: any) {
          conflictingCandidates.push({
            ...c,
            reason: err.message || String(err),
          });
          console.error(`  [X] Conflict on candidate "${c.slug}": ${err.message}`);
          throw err;
        }
      }

      console.log(`\n[APPLY SUMMARY] Applied: ${appliedCandidates.length}, Skipped: ${skippedCandidates.length}, Idempotent: ${idempotentCandidates.length}, Conflicts: ${conflictingCandidates.length}`);
      console.log('[APPLY] Transactional backfill complete.');
    } else {
      console.log('\n[APPLY] No eligible candidates to commit.');
    }
  } else {
    console.log('\n[DRY-RUN] No writes performed. Re-run with --apply to commit eligible locks.');
  }

  return {
    validCount: categoriesSnap.size - malformed.length,
    totalCategories: categoriesSnap.size,
    eligibleCandidates,
    matchingLocks,
    ownershipConflicts,
    duplicateConflicts,
    malformed,
    orphanedLocks,
    appliedCandidates,
    skippedCandidates,
    idempotentCandidates,
    conflictingCandidates,
  };
}

// Direct CLI invocation
if (process.argv[1] && (
  import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` ||
  import.meta.url.toLowerCase() === `file:///${process.argv[1].replace(/\\/g, '/')}`.toLowerCase() ||
  process.argv[1].endsWith('backfill-category-slugs.ts')
)) {
  auditAndBackfillCategorySlugs()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
