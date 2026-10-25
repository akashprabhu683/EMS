import test from "node:test";
import assert from "node:assert/strict";
import admin from "firebase-admin";
import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAndBackfillCategorySlugs } from "../../scripts/backfill-category-slugs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");
const scriptPath = path.resolve(rootDir, "scripts/backfill-category-slugs.ts");
const nodePath = path.resolve(__dirname, "../node_modules");
const adminBackendNodePath = path.resolve(rootDir, "admin-panel/backend/node_modules");
const combinedNodePath = `${nodePath}${path.delimiter}${adminBackendNodePath}`;
const tsxBinary = path.resolve(rootDir, "admin-panel/backend/node_modules/.bin", process.platform === "win32" ? "tsx.cmd" : "tsx");

const dedicatedProjectId = "demo-ems-slug-audit";
const emulatorHost = "127.0.0.1:8080";

// Ensure test execution explicitly targets the dedicated emulator project
process.env.FIRESTORE_EMULATOR_HOST = emulatorHost;
process.env.GCLOUD_PROJECT = dedicatedProjectId;

let testApp;
let db;

test.before(async () => {
  // Initialize isolated admin app dedicated to demo-ems-slug-audit
  const existingApp = admin.apps.find((a) => a && a.name === "slugAuditTestApp");
  if (existingApp) {
    testApp = existingApp;
  } else {
    testApp = admin.initializeApp({ projectId: dedicatedProjectId }, "slugAuditTestApp");
  }
  db = testApp.firestore();
});

test.after(async () => {
  if (testApp) {
    await testApp.delete();
  }
});

test("Category Slug Migration Audit — Comprehensive Isolation and Dry-Run Verification", async (t) => {
  await t.test("1. Seed isolated test fixtures in demo-ems-slug-audit emulator", async () => {
    // Clear any previous documents in emulator
    const [catsSnap, slugsSnap] = await Promise.all([
      db.collection("categories").get(),
      db.collection("category_slugs").get(),
    ]);

    const batch = db.batch();
    catsSnap.forEach((d) => batch.delete(d.ref));
    slugsSnap.forEach((d) => batch.delete(d.ref));
    await batch.commit();

    // 1.1 One valid missing slug (eligible for reservation)
    await db.collection("categories").doc("cat_valid_missing").set({
      name: "Digestive & Metabolism",
      slug: "digestive-metabolism",
      isActive: true,
    });

    // 1.2 One valid slug with a matching lock
    await db.collection("categories").doc("cat_valid_matching").set({
      name: "Ayurvedic Formulations",
      slug: "ayurvedic-formulations",
      isActive: true,
    });
    await db.collection("category_slugs").doc("ayurvedic-formulations").set({
      categoryId: "cat_valid_matching",
      slug: "ayurvedic-formulations",
    });

    // 1.3 One malformed slug
    await db.collection("categories").doc("cat_malformed").set({
      name: "Malformed Herbal Drops!!",
      slug: "Invalid Slug With Spaces & Upper!",
      isActive: true,
    });

    // 1.4 Two categories sharing a slug (duplicate conflict)
    await db.collection("categories").doc("cat_dup_1").set({
      name: "Vitality Blend Batch A",
      slug: "vitality-immunity-blend",
      isActive: true,
    });
    await db.collection("categories").doc("cat_dup_2").set({
      name: "Vitality Blend Batch B",
      slug: "vitality-immunity-blend",
      isActive: true,
    });

    // 1.5 A slug already locked to a different category ID (ownership conflict)
    await db.collection("categories").doc("cat_ownership_conflict").set({
      name: "Joint Care Balms New",
      slug: "joint-care-balms",
      isActive: true,
    });
    await db.collection("category_slugs").doc("joint-care-balms").set({
      categoryId: "different_legacy_category_id_999",
      slug: "joint-care-balms",
    });

    // Capture initial fixture state
    const beforeSlugsSnap = await db.collection("category_slugs").get();
    const beforeCatsSnap = await db.collection("categories").get();

    assert.equal(beforeCatsSnap.size, 6, "Total seeded categories must be 6");
    assert.equal(beforeSlugsSnap.size, 2, "Total initial locks in /category_slugs must be 2");

    const initialLockIds = beforeSlugsSnap.docs.map((d) => d.id).sort();
    assert.deepEqual(initialLockIds, ["ayurvedic-formulations", "joint-care-balms"]);
  });

  await t.test("2. Run dry-run audit and verify precise classification", async () => {
    // Record before counts and document content
    const beforeSlugs = await db.collection("category_slugs").get();
    const beforeSlugsMap = new Map(beforeSlugs.docs.map((d) => [d.id, d.data()]));

    const result = await auditAndBackfillCategorySlugs({
      db,
      isApply: false,
      projectId: dedicatedProjectId,
      requireEmulator: true,
    });

    // Verification 2.1: Exactly 1 eligible candidate (cat_valid_missing)
    assert.equal(result.eligibleCandidates.length, 1, "Must have exactly 1 eligible candidate");
    assert.equal(result.eligibleCandidates[0].categoryId, "cat_valid_missing");
    assert.equal(result.eligibleCandidates[0].slug, "digestive-metabolism");

    // Verification 2.2: Exactly 1 matching lock (cat_valid_matching)
    assert.equal(result.matchingLocks.length, 1, "Must have exactly 1 matching lock");
    assert.equal(result.matchingLocks[0].categoryId, "cat_valid_matching");
    assert.equal(result.matchingLocks[0].slug, "ayurvedic-formulations");

    // Verification 2.3: Exactly 1 malformed slug reported
    assert.equal(result.malformed.length, 1, "Must have exactly 1 malformed slug");
    assert.equal(result.malformed[0].id, "cat_malformed");
    assert.equal(result.malformed[0].slug, "Invalid Slug With Spaces & Upper!");
    assert.equal(result.malformed[0].suggested, "invalid-slug-with-spaces-upper");

    // Verification 2.4: Exactly 1 duplicate conflict group (2 categories)
    assert.equal(result.duplicateConflicts.size, 1, "Must have exactly 1 duplicate slug group");
    const dupCats = result.duplicateConflicts.get("vitality-immunity-blend");
    assert.ok(dupCats, "Duplicate conflict must exist for 'vitality-immunity-blend'");
    assert.equal(dupCats.length, 2, "Duplicate conflict group must have 2 categories");

    // Verification 2.5: Exactly 1 ownership conflict reported
    assert.equal(result.ownershipConflicts.length, 1, "Must have exactly 1 ownership conflict");
    assert.equal(result.ownershipConflicts[0].categoryId, "cat_ownership_conflict");
    assert.equal(result.ownershipConflicts[0].slug, "joint-care-balms");
    assert.equal(result.ownershipConflicts[0].lockedToCategoryId, "different_legacy_category_id_999");

    // Verification 2.6: Malformed and duplicates NEVER entered eligibleCandidates
    const eligibleSlugs = result.eligibleCandidates.map((c) => c.slug);
    assert.ok(!eligibleSlugs.includes("Invalid Slug With Spaces & Upper!"), "Malformed slug must not be in eligibleCandidates");
    assert.ok(!eligibleSlugs.includes("invalid-slug-with-spaces-upper"), "Sanitized malformed slug must not be auto-promoted to eligibleCandidates");
    assert.ok(!eligibleSlugs.includes("vitality-immunity-blend"), "Duplicate slug must not be in eligibleCandidates");
    assert.ok(!eligibleSlugs.includes("joint-care-balms"), "Conflicting lock slug must not be in eligibleCandidates");
    assert.ok(!eligibleSlugs.includes("ayurvedic-formulations"), "Already locked slug must not be in eligibleCandidates");

    // Verification 2.7: ZERO writes committed during dry-run
    const afterSlugs = await db.collection("category_slugs").get();
    assert.equal(afterSlugs.size, beforeSlugs.size, "Document count in /category_slugs must remain unchanged (2)");

    const afterSlugsMap = new Map(afterSlugs.docs.map((d) => [d.id, d.data()]));
    assert.equal(afterSlugsMap.size, beforeSlugsMap.size);
    for (const [id, beforeData] of beforeSlugsMap.entries()) {
      assert.ok(afterSlugsMap.has(id), `Lock ID ${id} must still exist`);
      assert.deepEqual(afterSlugsMap.get(id), beforeData, `Lock ID ${id} data must be byte-for-byte identical`);
    }

    // Verify malformed category in /categories was NOT silently modified
    const malformedDoc = await db.collection("categories").doc("cat_malformed").get();
    assert.equal(
      malformedDoc.data()?.slug,
      "Invalid Slug With Spaces & Upper!",
      "Category slug in /categories must not be mutated"
    );
  });

  await t.test("3. Safety Safeguard: Unavailable emulator connection must not fall back to production", async () => {
    // When emulatorHost is missing, calling auditAndBackfillCategorySlugs must throw immediately
    const originalEmulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIRESTORE_EMULATOR_HOST;

    try {
      await assert.rejects(
        async () => {
          await auditAndBackfillCategorySlugs({
            projectId: "demo-ems-slug-audit",
            requireEmulator: true,
          });
        },
        /SAFETY ABORT: FIRESTORE_EMULATOR_HOST is not set/
      );
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = originalEmulatorHost;
    }
  });

  await t.test("4. Child Process Invocation: Real script CLI entry point executes cleanly against emulator", async () => {
    const proc = spawnSync(tsxBinary, [scriptPath, `--project=${dedicatedProjectId}`], {
      cwd: rootDir,
      shell: true,
      env: {
        ...process.env,
        NODE_PATH: combinedNodePath,
        FIRESTORE_EMULATOR_HOST: emulatorHost,
        GCLOUD_PROJECT: dedicatedProjectId,
      },
      encoding: "utf-8",
    });

    assert.equal(proc.status, 0, `Child process must exit with code 0. Stderr: ${proc.stderr}`);
    const stdout = proc.stdout;

    assert.ok(stdout.includes("[Category Slugs Audit] Mode: DRY-RUN (Audit Only)"), "Must report DRY-RUN mode");
    assert.ok(stdout.includes(`[Category Slugs Audit] Project: ${dedicatedProjectId}`), "Must report demo project");
    assert.ok(stdout.includes(`[Category Slugs Audit] Environment: Emulator (${emulatorHost})`), "Must report emulator environment");
    assert.ok(stdout.includes("Eligible Candidates to Reserve: 1"), "Must report 1 candidate");
    assert.ok(stdout.includes('Reserve slug "digestive-metabolism"'), "Must propose valid candidate");
    assert.ok(!stdout.includes('Reserve slug "Invalid Slug With Spaces & Upper!"'), "Must NOT propose malformed slug");
    assert.ok(!stdout.includes('Reserve slug "vitality-immunity-blend"'), "Must NOT propose duplicate slug");
    assert.ok(stdout.includes("[DRY-RUN] No writes performed."), "Must confirm zero writes performed");
  });

  await t.test("5. Real Entry Point CLI Guard: Exit nonzero when emulator host is unset without making network calls", async () => {
    const cleanEnv = { ...process.env };
    delete cleanEnv.FIRESTORE_EMULATOR_HOST;
    delete cleanEnv.EMS_ALLOW_PRODUCTION;

    const proc = spawnSync(tsxBinary, [scriptPath, `--project=${dedicatedProjectId}`], {
      cwd: rootDir,
      shell: true,
      env: {
        ...cleanEnv,
        NODE_PATH: combinedNodePath,
      },
      encoding: "utf-8",
    });

    assert.notEqual(proc.status, 0, "CLI must exit nonzero when FIRESTORE_EMULATOR_HOST is unset");
    assert.equal(proc.status, 1, "CLI must exit with code 1");

    const combinedOutput = (proc.stdout || "") + (proc.stderr || "");
    assert.ok(
      combinedOutput.includes("SAFETY ABORT: FIRESTORE_EMULATOR_HOST is not set"),
      `Must display SAFETY ABORT error. Output: ${combinedOutput}`
    );
  });

  await t.test("6. Transactional Race Safety: Stale candidate, concurrently modified slug, and concurrent deletion", async () => {
    // Clean slate for race-condition test
    const [catsSnap, slugsSnap] = await Promise.all([
      db.collection("categories").get(),
      db.collection("category_slugs").get(),
    ]);
    const b = db.batch();
    catsSnap.forEach((d) => b.delete(d.ref));
    slugsSnap.forEach((d) => b.delete(d.ref));
    await b.commit();

    // Seed 3 categories
    // Cat A: Will have its slug modified concurrently
    await db.collection("categories").doc("cat_race_stale").set({
      name: "Race Stale Category",
      slug: "stale-slug-initial",
      isActive: true,
    });

    // Cat B: Will be deleted concurrently
    await db.collection("categories").doc("cat_race_deleted").set({
      name: "Race Deleted Category",
      slug: "deleted-slug-initial",
      isActive: true,
    });

    // Cat C: Normal valid candidate that remains unchanged
    await db.collection("categories").doc("cat_race_valid").set({
      name: "Race Valid Category",
      slug: "valid-race-slug",
      isActive: true,
    });

    // Execute auditAndBackfillCategorySlugs with isApply: true and simulate race via beforeApply hook
    const result = await auditAndBackfillCategorySlugs({
      db,
      isApply: true,
      projectId: dedicatedProjectId,
      requireEmulator: true,
      beforeApply: async () => {
        // Admin updates cat_race_stale to "stale-slug-modified" concurrently
        await db.collection("categories").doc("cat_race_stale").update({
          slug: "stale-slug-modified",
        });
        // Admin deletes cat_race_deleted concurrently
        await db.collection("categories").doc("cat_race_deleted").delete();
      },
    });

    // Verification 6.1: Valid candidate applied
    assert.equal(result.appliedCandidates?.length, 1, "Exactly 1 valid candidate must be applied");
    assert.equal(result.appliedCandidates[0].categoryId, "cat_race_valid");
    assert.equal(result.appliedCandidates[0].slug, "valid-race-slug");

    // Verification 6.2: Stale slug was skipped, NOT applied
    const staleLockSnap = await db.collection("category_slugs").doc("stale-slug-initial").get();
    assert.equal(staleLockSnap.exists, false, "Stale slug lock must NOT be created in /category_slugs");

    // Verification 6.3: Deleted category was skipped, NOT applied
    const deletedLockSnap = await db.collection("category_slugs").doc("deleted-slug-initial").get();
    assert.equal(deletedLockSnap.exists, false, "Deleted category slug lock must NOT be created");

    // Verification 6.4: Valid slug lock was created accurately
    const validLockSnap = await db.collection("category_slugs").doc("valid-race-slug").get();
    assert.equal(validLockSnap.exists, true, "Valid category slug lock MUST exist");
    assert.equal(validLockSnap.data()?.categoryId, "cat_race_valid");
    assert.equal(validLockSnap.data()?.slug, "valid-race-slug");

    // Verification 6.5: Skipped candidates recorded accurately
    assert.ok(result.skippedCandidates?.some((c) => c.categoryId === "cat_race_stale"));
    assert.ok(result.skippedCandidates?.some((c) => c.categoryId === "cat_race_deleted"));
  });

  await t.test("7. Transactional Race Safety: Idempotent matching lock vs conflicting lock rejection", async () => {
    // Clean slate
    const [catsSnap, slugsSnap] = await Promise.all([
      db.collection("categories").get(),
      db.collection("category_slugs").get(),
    ]);
    const b = db.batch();
    catsSnap.forEach((d) => b.delete(d.ref));
    slugsSnap.forEach((d) => b.delete(d.ref));
    await b.commit();

    // 7.1 Category with consistent pre-existing lock
    await db.collection("categories").doc("cat_idem").set({
      name: "Idempotent Category",
      slug: "idem-slug",
      isActive: true,
    });
    await db.collection("category_slugs").doc("idem-slug").set({
      categoryId: "cat_idem",
      slug: "idem-slug",
    });

    const idemResult = await auditAndBackfillCategorySlugs({
      db,
      isApply: true,
      projectId: dedicatedProjectId,
      requireEmulator: true,
    });

    assert.equal(idemResult.matchingLocks.length, 1);
    assert.equal(idemResult.matchingLocks[0].categoryId, "cat_idem");

    // 7.2 Conflict scenario: Category with slug that was locked to someone else
    await db.collection("categories").doc("cat_conflict_owner").set({
      name: "Conflict Owner Category",
      slug: "contested-slug",
      isActive: true,
    });
    await db.collection("category_slugs").doc("contested-slug").set({
      categoryId: "intruder_id_456",
      slug: "contested-slug",
    });

    const conflictResult = await auditAndBackfillCategorySlugs({
      db,
      isApply: false,
      projectId: dedicatedProjectId,
      requireEmulator: true,
    });

    assert.equal(conflictResult.ownershipConflicts.length, 1);
    assert.equal(conflictResult.ownershipConflicts[0].lockedToCategoryId, "intruder_id_456");
    assert.equal(conflictResult.ownershipConflicts[0].categoryId, "cat_conflict_owner");

    // Ensure the intruder lock was not modified or overwritten
    const intruderSnap = await db.collection("category_slugs").doc("contested-slug").get();
    assert.equal(intruderSnap.data()?.categoryId, "intruder_id_456");
  });

  await t.test("8. Concurrent Category Transactions: OCC verification under contention", async () => {
    // Seed category
    await db.collection("categories").doc("cat_occ").set({
      name: "OCC Category",
      slug: "occ-slug-test",
      isActive: true,
    });
    await db.collection("category_slugs").doc("occ-slug-test").delete();

    // Trigger two concurrent apply runs
    const [res1, res2] = await Promise.allSettled([
      auditAndBackfillCategorySlugs({ db, isApply: true, projectId: dedicatedProjectId, requireEmulator: true }),
      auditAndBackfillCategorySlugs({ db, isApply: true, projectId: dedicatedProjectId, requireEmulator: true }),
    ]);

    assert.equal(res1.status, "fulfilled");
    assert.equal(res2.status, "fulfilled");

    const lockDoc = await db.collection("category_slugs").doc("occ-slug-test").get();
    assert.equal(lockDoc.exists, true, "Lock doc must exist");
    assert.equal(lockDoc.data()?.categoryId, "cat_occ");
    assert.equal(lockDoc.data()?.slug, "occ-slug-test");
  });
});
