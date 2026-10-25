import { onCall, HttpsError, CallableRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
export const PRIMARY_SUPERADMIN_EMAIL = "akashprabhu0302@gmail.com";

/* ═══════════════════════════════════════════════════════════════════════
   TYPES & SCHEMAS
   ═══════════════════════════════════════════════════════════════════════ */

export interface AdminCaller {
  uid: string;
  email?: string;
  role: "superadmin" | "admin";
}

export interface CreateProductInput {
  name: string;
  description: string;
  categoryId: string;
  pricePaise: number;
  stock: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  imageUrl?: string;
}

export interface UpdateProductInput {
  productId: string;
  name?: string;
  description?: string;
  categoryId?: string;
  pricePaise?: number;
  stock?: number;
  expectedCurrentStock?: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  imageUrl?: string;
}

export interface AdjustStockInput {
  productId: string;
  adjustmentType: "set" | "delta";
  value: number;
  reason?: string;
}

export interface SetProductStatusInput {
  productId: string;
  isActive: boolean;
}

export interface DeleteProductInput {
  productId: string;
}

export interface CreateCategoryInput {
  name: string;
  slug: string;
  description?: string;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  categoryId: string;
  name?: string;
  slug?: string;
  description?: string;
  isActive?: boolean;
}

export interface SetCategoryStatusInput {
  categoryId: string;
  isActive: boolean;
}

export interface DeleteCategoryInput {
  categoryId: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   ADMIN CALLER VERIFICATION
   ═══════════════════════════════════════════════════════════════════════ */

export async function verifyAdminCaller(
  db: FirebaseFirestore.Firestore,
  request: CallableRequest<any>
): Promise<AdminCaller> {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "Authentication is required to perform catalog operations.");
  }

  const uid = request.auth.uid;
  const rawEmail = request.auth.token.email as string | undefined;
  const cleanEmail = rawEmail ? rawEmail.toLowerCase().trim() : "";

  // 1. Real-time revocation check: Revoked administrators are strictly blocked
  const revocationDoc = await db.collection("admin_revocations").doc(uid).get();
  if (revocationDoc.exists) {
    throw new HttpsError("permission-denied", "Administrator privilege has been revoked for this account.");
  }

  // 2. Superadmin identity matching authoritative EMS configuration
  const isSuperadmin = Boolean(cleanEmail && cleanEmail === PRIMARY_SUPERADMIN_EMAIL.toLowerCase());

  // 3. Verify active administrator record in /admins/{uid}
  let isAdmin = Boolean(request.auth.token.admin) || isSuperadmin;
  const adminDoc = await db.collection("admins").doc(uid).get();
  if (adminDoc.exists) {
    if (adminDoc.data()?.isActive === false && !isSuperadmin) {
      throw new HttpsError("permission-denied", "Administrator privilege has been deactivated.");
    }
    isAdmin = true;
  }

  if (!isAdmin || (!adminDoc.exists && !isSuperadmin)) {
    throw new HttpsError("permission-denied", "Administrator privilege is required for catalog mutations.");
  }

  const role: "superadmin" | "admin" = isSuperadmin ? "superadmin" : "admin";
  return { uid, email: rawEmail, role };
}

/* ═══════════════════════════════════════════════════════════════════════
   PRODUCT CORE BUSINESS LOGIC
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Creates a product with full server-side validation and atomic audit logging.
 */
export async function executeCreateProduct(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: CreateProductInput
): Promise<{ productId: string; success: boolean }> {
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 200) {
    throw new HttpsError("invalid-argument", "Product name must be between 2 and 200 characters.");
  }

  const description = String(input.description || "").trim();
  if (description.length < 2 || description.length > 5000) {
    throw new HttpsError("invalid-argument", "Product description must be between 2 and 5000 characters.");
  }

  const categoryId = String(input.categoryId || "").trim();
  if (!categoryId) {
    throw new HttpsError("invalid-argument", "Please select a valid category.");
  }

  // Validate category existence
  const catSnap = await db.collection("categories").doc(categoryId).get();
  if (!catSnap.exists) {
    throw new HttpsError("invalid-argument", `Category "${categoryId}" does not exist in the database.`);
  }

  const pricePaise = Number(input.pricePaise);
  if (!Number.isSafeInteger(pricePaise) || pricePaise <= 0 || pricePaise > 10000000) {
    throw new HttpsError("invalid-argument", "Price must be a valid positive integer in paise (up to ₹1,00,000).");
  }

  const stock = Number(input.stock);
  if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
    throw new HttpsError("invalid-argument", "Stock must be a non-negative whole integer (0 to 1,000,000).");
  }

  const lowStockThreshold = input.lowStockThreshold !== undefined ? Number(input.lowStockThreshold) : 5;
  if (!Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new HttpsError("invalid-argument", "Low-stock threshold must be a non-negative whole integer.");
  }

  const imageUrl = input.imageUrl && typeof input.imageUrl === "string" ? input.imageUrl.trim() : "";
  if (imageUrl && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:image/")) {
    throw new HttpsError("invalid-argument", "Image URL must be a secure HTTPS link or valid image data.");
  }

  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;

  // Stable human-readable slug ID
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  const stableId = `prod_${slug}_${Date.now().toString(36)}`;

  const now = FieldValue.serverTimestamp();
  const productPayload: Record<string, any> = {
    id: stableId,
    name,
    description,
    categoryId,
    category: categoryId,
    categorySlug: categoryId,
    price: pricePaise,
    stock,
    lowStockThreshold,
    isActive,
    isLowStock: stock > 0 && stock <= lowStockThreshold,
    isOutOfStock: stock === 0,
    imageUrl: imageUrl || undefined,
    images: imageUrl ? [imageUrl] : [],
    rating: 4.5,
    reviewCount: 0,
    featured: false,
    isNew: true,
    tags: [],
    auditLoggedDirectly: true,
    createdAt: now,
    updatedAt: now,
  };

  const prodRef = db.collection("products").doc(stableId);
  const auditRef = db.collection("audit_logs").doc();

  const batch = db.batch();
  batch.set(prodRef, productPayload);
  batch.set(auditRef, {
    action: "PRODUCT_CREATED",
    actor: {
      uid: caller.uid,
      email: caller.email,
      role: caller.role,
    },
    target: {
      collection: "products",
      id: stableId,
      label: name,
    },
    summary: `Product "${name}" created with initial stock of ${stock} units and price of ₹${(pricePaise / 100).toFixed(2)} by ${caller.email || caller.uid}.`,
    metadata: {
      pricePaise,
      stock,
      categoryId,
      isActive,
    },
    timestamp: now,
  });

  await batch.commit();
  return { productId: stableId, success: true };
}

/**
 * Updates a product atomically in a transaction to prevent race conditions
 * and overwriting concurrent order stock deductions.
 */
export async function executeUpdateProduct(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: UpdateProductInput
): Promise<{ productId: string; success: boolean }> {
  const productId = String(input.productId || "").trim();
  if (!productId) {
    throw new HttpsError("invalid-argument", "productId is required.");
  }

  const prodRef = db.collection("products").doc(productId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(prodRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Product "${productId}" does not exist.`);
    }

    const current = snap.data() || {};
    const changes: Array<{ field: string; before: any; after: any }> = [];
    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
      auditLoggedDirectly: true,
    };

    // 1. Name
    if (input.name !== undefined) {
      const cleanName = String(input.name).trim();
      if (cleanName.length < 2 || cleanName.length > 200) {
        throw new HttpsError("invalid-argument", "Product name must be between 2 and 200 characters.");
      }
      if (cleanName !== current.name) {
        changes.push({ field: "name", before: current.name, after: cleanName });
        updates.name = cleanName;
      }
    }

    // 2. Description
    if (input.description !== undefined) {
      const cleanDesc = String(input.description).trim();
      if (cleanDesc.length < 2 || cleanDesc.length > 5000) {
        throw new HttpsError("invalid-argument", "Product description must be between 2 and 5000 characters.");
      }
      if (cleanDesc !== current.description) {
        changes.push({ field: "description", before: current.description, after: cleanDesc });
        updates.description = cleanDesc;
      }
    }

    // 3. CategoryId
    if (input.categoryId !== undefined) {
      const cleanCat = String(input.categoryId).trim();
      if (!cleanCat) {
        throw new HttpsError("invalid-argument", "Please select a valid category.");
      }
      if (cleanCat !== current.categoryId) {
        const catSnap = await transaction.get(db.collection("categories").doc(cleanCat));
        if (!catSnap.exists) {
          throw new HttpsError("invalid-argument", `Category "${cleanCat}" does not exist in the database.`);
        }
        changes.push({ field: "categoryId", before: current.categoryId, after: cleanCat });
        updates.categoryId = cleanCat;
        updates.category = cleanCat;
        updates.categorySlug = cleanCat;
      }
    }

    // 4. Price
    if (input.pricePaise !== undefined) {
      const pricePaise = Number(input.pricePaise);
      if (!Number.isSafeInteger(pricePaise) || pricePaise <= 0 || pricePaise > 10000000) {
        throw new HttpsError("invalid-argument", "Price must be a valid positive integer in paise (up to ₹1,00,000).");
      }
      if (pricePaise !== current.price) {
        changes.push({ field: "price", before: current.price, after: pricePaise });
        updates.price = pricePaise;
      }
    }

    // 5. Low stock threshold
    let lowStockThreshold = Number(current.lowStockThreshold ?? 5);
    if (input.lowStockThreshold !== undefined) {
      const thresh = Number(input.lowStockThreshold);
      if (!Number.isSafeInteger(thresh) || thresh < 0) {
        throw new HttpsError("invalid-argument", "Low-stock threshold must be a non-negative whole integer.");
      }
      if (thresh !== lowStockThreshold) {
        changes.push({ field: "lowStockThreshold", before: lowStockThreshold, after: thresh });
        updates.lowStockThreshold = thresh;
        lowStockThreshold = thresh;
      }
    }

    // 6. Stock: Concurrency Protected
    let currentStock = Number(current.stock ?? 0);
    if (input.stock !== undefined) {
      const stock = Number(input.stock);
      if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) {
        throw new HttpsError("invalid-argument", "Stock must be a non-negative whole integer (0 to 1,000,000).");
      }

      // Optimistic concurrency check if caller provided expected current stock
      if (input.expectedCurrentStock !== undefined) {
        const expStock = Number(input.expectedCurrentStock);
        if (currentStock !== expStock) {
          throw new HttpsError(
            "failed-precondition",
            `Stock conflict: Product stock was modified concurrently (current: ${currentStock}, expected: ${expStock}). Please refresh before updating stock.`
          );
        }
      }

      if (stock !== currentStock) {
        changes.push({ field: "stock", before: currentStock, after: stock });
        updates.stock = stock;
        currentStock = stock;
      }
    }

    updates.isLowStock = currentStock > 0 && currentStock <= lowStockThreshold;
    updates.isOutOfStock = currentStock === 0;

    // 7. IsActive
    if (input.isActive !== undefined) {
      const isActive = Boolean(input.isActive);
      if (isActive !== Boolean(current.isActive)) {
        changes.push({ field: "isActive", before: current.isActive, after: isActive });
        updates.isActive = isActive;
      }
    }

    // 8. ImageUrl
    if (input.imageUrl !== undefined) {
      const cleanImg = String(input.imageUrl || "").trim();
      if (cleanImg && !cleanImg.startsWith("https://") && !cleanImg.startsWith("data:image/")) {
        throw new HttpsError("invalid-argument", "Image URL must be a secure HTTPS link or valid image data.");
      }
      if (cleanImg !== (current.imageUrl || "")) {
        changes.push({ field: "imageUrl", before: current.imageUrl, after: cleanImg });
        updates.imageUrl = cleanImg;
        updates.images = cleanImg ? [cleanImg] : [];
      }
    }

    if (changes.length === 0) {
      return { productId, success: true };
    }

    transaction.update(prodRef, updates);

    // Append-only audit record
    const hasStockChange = changes.some((c) => c.field === "stock");
    const isStockOnly = changes.length === 1 && hasStockChange;
    const action = isStockOnly ? "INVENTORY_ADJUSTED" : "PRODUCT_UPDATED";
    const prodName = updates.name || current.name || productId;

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action,
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "products",
        id: productId,
        label: prodName,
      },
      summary: isStockOnly
        ? `Stock for "${prodName}" adjusted from ${changes[0].before} to ${changes[0].after} units by ${caller.email || caller.uid}.`
        : `Product "${prodName}" updated (${changes.map((c) => c.field).join(", ")}) by ${caller.email || caller.uid}.`,
      changes,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { productId, success: true };
  });
}

/**
 * Dedicated atomic stock adjustment endpoint.
 * Supports absolute ("set") or relative ("delta") adjustments with a mandatory/optional reason.
 */
export async function executeAdjustProductStock(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: AdjustStockInput
): Promise<{ productId: string; previousStock: number; newStock: number; success: boolean }> {
  const productId = String(input.productId || "").trim();
  if (!productId) {
    throw new HttpsError("invalid-argument", "productId is required.");
  }

  const { adjustmentType, value, reason } = input;
  if (adjustmentType !== "set" && adjustmentType !== "delta") {
    throw new HttpsError("invalid-argument", "adjustmentType must be either 'set' or 'delta'.");
  }

  const numVal = Number(value);
  if (!Number.isSafeInteger(numVal)) {
    throw new HttpsError("invalid-argument", "Adjustment value must be a safe integer.");
  }

  const prodRef = db.collection("products").doc(productId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(prodRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Product "${productId}" does not exist.`);
    }

    const current = snap.data() || {};
    const currentStock = Number(current.stock ?? 0);
    const lowStockThreshold = Number(current.lowStockThreshold ?? 5);

    let newStock = currentStock;
    if (adjustmentType === "set") {
      if (numVal < 0) {
        throw new HttpsError("invalid-argument", "Target stock cannot be negative.");
      }
      newStock = numVal;
    } else {
      newStock = currentStock + numVal;
      if (newStock < 0) {
        throw new HttpsError("failed-precondition", `Cannot reduce stock by ${Math.abs(numVal)}. Available stock is only ${currentStock}.`);
      }
    }

    const isLowStock = newStock > 0 && newStock <= lowStockThreshold;
    const isOutOfStock = newStock === 0;

    transaction.update(prodRef, {
      stock: newStock,
      isLowStock,
      isOutOfStock,
      auditLoggedDirectly: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const prodName = current.name || productId;
    const cleanReason = String(reason || "Manual inventory adjustment").trim();

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "INVENTORY_ADJUSTED",
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "products",
        id: productId,
        label: prodName,
      },
      summary: `Stock for "${prodName}" adjusted from ${currentStock} to ${newStock} (${adjustmentType === "delta" ? (numVal >= 0 ? `+${numVal}` : `${numVal}`) : `set to ${numVal}`}). Reason: ${cleanReason}.`,
      changes: [{ field: "stock", before: currentStock, after: newStock }],
      metadata: {
        adjustmentType,
        value: numVal,
        reason: cleanReason,
      },
      timestamp: FieldValue.serverTimestamp(),
    });

    return { productId, previousStock: currentStock, newStock, success: true };
  });
}

/**
 * Authoritatively sets product active status with atomic audit logging.
 */
export async function executeSetProductStatus(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: SetProductStatusInput
): Promise<{ productId: string; isActive: boolean; success: boolean }> {
  const productId = String(input.productId || "").trim();
  if (!productId) {
    throw new HttpsError("invalid-argument", "productId is required.");
  }

  const isActive = Boolean(input.isActive);
  const prodRef = db.collection("products").doc(productId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(prodRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Product "${productId}" does not exist.`);
    }

    const current = snap.data() || {};
    const beforeStatus = Boolean(current.isActive);

    if (beforeStatus === isActive) {
      return { productId, isActive, success: true };
    }

    transaction.update(prodRef, {
      isActive,
      auditLoggedDirectly: true,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const prodName = current.name || productId;
    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "PRODUCT_UPDATED",
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "products",
        id: productId,
        label: prodName,
      },
      summary: `Product "${prodName}" ${isActive ? "activated" : "deactivated"} by ${caller.email || caller.uid}.`,
      changes: [{ field: "isActive", before: beforeStatus, after: isActive }],
      timestamp: FieldValue.serverTimestamp(),
    });

    return { productId, isActive, success: true };
  });
}

/**
 * Physical deletion of products is strictly prohibited to prevent race conditions with
 * order creation and protect historical order audit records.
 * Clients must deactivate products instead.
 */
export async function executeDeleteProduct(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: DeleteProductInput
): Promise<{ productId: string; success: boolean }> {
  const productId = String(input.productId || "").trim();
  if (!productId) {
    throw new HttpsError("invalid-argument", "productId is required.");
  }

  const prodRef = db.collection("products").doc(productId);
  const prodSnap = await prodRef.get();
  if (!prodSnap.exists) {
    throw new HttpsError("not-found", `Product "${productId}" does not exist.`);
  }

  // Reject physical deletion; require deactivation
  throw new HttpsError(
    "failed-precondition",
    `Physical deletion of catalog products is prohibited to protect historical and concurrent order integrity. Please deactivate the product instead.`
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CATEGORY CORE BUSINESS LOGIC
   ═══════════════════════════════════════════════════════════════════════ */

export function validateCategorySlug(slug: string): string {
  const clean = slug.toLowerCase().trim();
  if (!clean) {
    throw new HttpsError("invalid-argument", "Category slug is required.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    throw new HttpsError(
      "invalid-argument",
      "Slug must only contain lowercase alphanumeric characters and single hyphens (e.g. 'ayurvedic-oils')."
    );
  }
  return clean;
}

/**
 * Creates a category with concurrency-safe slug uniqueness enforced via a unique slug document lock.
 */
export async function executeCreateCategory(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: CreateCategoryInput
): Promise<{ categoryId: string; success: boolean }> {
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 100) {
    throw new HttpsError("invalid-argument", "Category name must be between 2 and 100 characters.");
  }

  const cleanSlug = validateCategorySlug(input.slug);
  const description = typeof input.description === "string" ? input.description.trim() : undefined;
  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : true;
  const now = FieldValue.serverTimestamp();

  const catRef = db.collection("categories").doc();
  const catId = catRef.id;
  const slugLockRef = db.collection("category_slugs").doc(cleanSlug);
  const auditRef = db.collection("audit_logs").doc();

  return await db.runTransaction(async (transaction) => {
    // 1. Transactional read of unique slug lock document (prevents race conditions)
    const slugLockSnap = await transaction.get(slugLockRef);
    if (slugLockSnap.exists) {
      throw new HttpsError("already-exists", `The slug "${cleanSlug}" is already in use by another category.`);
    }

    // 2. Transactional writes: create slug lock doc, category doc, and audit log atomically
    transaction.set(slugLockRef, {
      categoryId: catId,
      slug: cleanSlug,
      createdAt: now,
    });

    transaction.set(catRef, {
      id: catId,
      name,
      slug: cleanSlug,
      description: description || "",
      isActive,
      createdAt: now,
      updatedAt: now,
    });

    transaction.set(auditRef, {
      action: "CATEGORY_CREATED",
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "categories",
        id: catId,
        label: name,
      },
      summary: `Category "${name}" (slug: ${cleanSlug}) created by ${caller.email || caller.uid}.`,
      metadata: {
        slug: cleanSlug,
        isActive,
      },
      timestamp: now,
    });

    return { categoryId: catId, success: true };
  });
}

/**
 * Updates a category with concurrency-safe slug uniqueness checking and audit logging.
 */
export async function executeUpdateCategory(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: UpdateCategoryInput
): Promise<{ categoryId: string; success: boolean }> {
  const categoryId = String(input.categoryId || "").trim();
  if (!categoryId) {
    throw new HttpsError("invalid-argument", "categoryId is required.");
  }

  const catRef = db.collection("categories").doc(categoryId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(catRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Category "${categoryId}" does not exist.`);
    }

    const current = snap.data() || {};
    const changes: Array<{ field: string; before: any; after: any }> = [];
    const updates: Record<string, any> = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (input.name !== undefined) {
      const cleanName = String(input.name).trim();
      if (cleanName.length < 2 || cleanName.length > 100) {
        throw new HttpsError("invalid-argument", "Category name must be between 2 and 100 characters.");
      }
      if (cleanName !== current.name) {
        changes.push({ field: "name", before: current.name, after: cleanName });
        updates.name = cleanName;
      }
    }

    if (input.slug !== undefined) {
      const cleanSlug = validateCategorySlug(input.slug);
      if (cleanSlug !== current.slug) {
        const newSlugLockRef = db.collection("category_slugs").doc(cleanSlug);
        const newSlugSnap = await transaction.get(newSlugLockRef);
        if (newSlugSnap.exists && newSlugSnap.data()?.categoryId !== categoryId) {
          throw new HttpsError("already-exists", `The slug "${cleanSlug}" is already in use by another category.`);
        }

        if (current.slug) {
          transaction.delete(db.collection("category_slugs").doc(current.slug));
        }
        transaction.set(newSlugLockRef, {
          categoryId,
          slug: cleanSlug,
          updatedAt: FieldValue.serverTimestamp(),
        });

        changes.push({ field: "slug", before: current.slug, after: cleanSlug });
        updates.slug = cleanSlug;
      }
    }

    if (input.description !== undefined) {
      const cleanDesc = String(input.description).trim();
      if (cleanDesc !== (current.description || "")) {
        changes.push({ field: "description", before: current.description, after: cleanDesc });
        updates.description = cleanDesc;
      }
    }

    if (input.isActive !== undefined) {
      const isActive = Boolean(input.isActive);
      if (isActive !== Boolean(current.isActive)) {
        changes.push({ field: "isActive", before: current.isActive, after: isActive });
        updates.isActive = isActive;
      }
    }

    if (changes.length === 0) {
      return { categoryId, success: true };
    }

    const catName = updates.name || current.name || categoryId;
    transaction.update(catRef, updates);

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "CATEGORY_UPDATED",
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "categories",
        id: categoryId,
        label: catName,
      },
      summary: `Category "${catName}" updated (${changes.map((c) => c.field).join(", ")}) by ${caller.email || caller.uid}.`,
      changes,
      timestamp: FieldValue.serverTimestamp(),
    });

    return { categoryId, success: true };
  });
}

/**
 * Authoritatively toggles category active status with audit logging.
 */
export async function executeSetCategoryStatus(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: SetCategoryStatusInput
): Promise<{ categoryId: string; isActive: boolean; success: boolean }> {
  const categoryId = String(input.categoryId || "").trim();
  if (!categoryId) {
    throw new HttpsError("invalid-argument", "categoryId is required.");
  }

  const isActive = Boolean(input.isActive);
  const catRef = db.collection("categories").doc(categoryId);

  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(catRef);
    if (!snap.exists) {
      throw new HttpsError("not-found", `Category "${categoryId}" does not exist.`);
    }

    const current = snap.data() || {};
    const beforeStatus = Boolean(current.isActive);
    if (beforeStatus === isActive) {
      return { categoryId, isActive, success: true };
    }

    const catName = current.name || categoryId;
    transaction.update(catRef, {
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection("audit_logs").doc();
    transaction.set(auditRef, {
      action: "CATEGORY_UPDATED",
      actor: {
        uid: caller.uid,
        email: caller.email,
        role: caller.role,
      },
      target: {
        collection: "categories",
        id: categoryId,
        label: catName,
      },
      summary: `Category "${catName}" ${isActive ? "activated" : "deactivated"} by ${caller.email || caller.uid}.`,
      changes: [{ field: "isActive", before: beforeStatus, after: isActive }],
      timestamp: FieldValue.serverTimestamp(),
    });

    return { categoryId, isActive, success: true };
  });
}

/**
 * Physical deletion of categories is strictly prohibited to protect catalog referential integrity.
 * Clients must deactivate categories instead.
 */
export async function executeDeleteCategory(
  db: FirebaseFirestore.Firestore,
  caller: AdminCaller,
  input: DeleteCategoryInput
): Promise<{ categoryId: string; success: boolean }> {
  const categoryId = String(input.categoryId || "").trim();
  if (!categoryId) {
    throw new HttpsError("invalid-argument", "categoryId is required.");
  }

  const catRef = db.collection("categories").doc(categoryId);
  const snap = await catRef.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", `Category "${categoryId}" does not exist.`);
  }

  // Reject physical deletion; require deactivation
  throw new HttpsError(
    "failed-precondition",
    `Physical deletion of categories is prohibited to protect catalog referential integrity. Please deactivate the category instead.`
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   CALLABLE CLOUD FUNCTIONS
   ═══════════════════════════════════════════════════════════════════════ */

export const createAdminProduct = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<CreateProductInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeCreateProduct(db, caller, request.data);
  }
);

export const updateAdminProduct = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<UpdateProductInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeUpdateProduct(db, caller, request.data);
  }
);

export const adjustAdminProductStock = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<AdjustStockInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeAdjustProductStock(db, caller, request.data);
  }
);

export const setAdminProductStatus = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<SetProductStatusInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeSetProductStatus(db, caller, request.data);
  }
);

export const deleteAdminProduct = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<DeleteProductInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeDeleteProduct(db, caller, request.data);
  }
);

export const createAdminCategory = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<CreateCategoryInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeCreateCategory(db, caller, request.data);
  }
);

export const updateAdminCategory = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<UpdateCategoryInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeUpdateCategory(db, caller, request.data);
  }
);

export const setAdminCategoryStatus = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<SetCategoryStatusInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeSetCategoryStatus(db, caller, request.data);
  }
);

export const deleteAdminCategory = onCall(
  { cors: true, invoker: "public" },
  async (request: CallableRequest<DeleteCategoryInput>) => {
    const db = admin.firestore();
    const caller = await verifyAdminCaller(db, request);
    return await executeDeleteCategory(db, caller, request.data);
  }
);
