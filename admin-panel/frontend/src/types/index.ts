import type { Timestamp } from 'firebase/firestore';

export interface Product {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  // Stored in paise as an integer (e.g., 29900 for ₹299.00)
  price: number;
  imageUrl?: string;
  stock: number;
  lowStockThreshold?: number;
  isActive: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface ProductFormData {
  name: string;
  description: string;
  categoryId: string;
  // Price in rupees entered by admin in form
  priceRupees: string;
  imageUrl: string;
  stock: string;
  lowStockThreshold: string;
  isActive: boolean;
  expectedCurrentStock?: number;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export interface CategoryFormData {
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
}

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  isSuperadmin?: boolean;
  role?: 'superadmin' | 'admin';
}

export type AuditAction =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'ORDER_COLLECTED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_RECORDED'
  | 'PAYMENT_CORRECTED'
  | 'INVENTORY_DEDUCTED'
  | 'INVENTORY_RESTORED'
  | 'PRODUCT_CREATED'
  | 'PRODUCT_UPDATED'
  | 'PRODUCT_DELETED'
  | 'INVENTORY_ADJUSTED'
  | 'CATEGORY_CREATED'
  | 'CATEGORY_UPDATED'
  | 'CATEGORY_DELETED'
  | 'ADMIN_ROLE_GRANTED'
  | 'ADMIN_ROLE_REVOKED'
  | 'ADMIN_INVITED'
  | 'ADMIN_INVITATION_RESENT';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actor: {
    uid: string;
    email?: string;
    role: string;
  };
  target: {
    collection: string;
    id: string;
    label?: string;
  };
  summary: string;
  changes?: {
    field: string;
    before: any;
    after: any;
  }[];
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface OperationalReportData {
  generatedAt: string;
  timezone: string;
  meta?: {
    isTruncated?: boolean;
    ordersProcessed?: number;
    maxOrdersCeiling?: number;
    startDate?: string;
    endDate?: string;
    warning?: string;
  };
  orders: {
    totalOrders: number;
    activeOrders: number;
    placed: { count: number; totalPaise: number };
    awaitingPreparation: { count: number; totalPaise: number };
    inPreparation: { count: number; totalPaise: number };
    readyForPickup: { count: number; totalPaise: number };
    collected: { count: number; totalPaise: number };
    cancelled: { count: number; totalPaise: number };
  };
  financials: {
    confirmedCashPaise: number;
    confirmedCashRupees: number;
    outstandingUnpaidPaise: number;
    outstandingUnpaidRupees: number;
    grossPipelinePaise: number;
    grossPipelineRupees: number;
    cancelledPaise: number;
    cancelledRupees: number;
    confirmedPaymentsCount: number;
  };
  dailyCollections: {
    date: string;
    ordersCollected: number;
    cashCollectedPaise: number;
    cashCollectedRupees: number;
    staffActors: string[];
  }[];
  inventory: {
    totalCatalogItems: number;
    inStockItems: number;
    lowStockItems: number;
    outOfStockItems: number;
    totalStockUnits: number;
    totalStockValuationPaise: number;
    totalStockValuationRupees: number;
    lowStockAlerts: {
      productId: string;
      name: string;
      currentStock: number;
      threshold: number;
      pricePaise: number;
    }[];
  };
  reconciliation: {
    discrepancyCount: number;
    discrepancies: {
      type: 'UNPAID_COLLECTION' | 'PAID_CANCELLED' | 'UNRESTORED_INVENTORY';
      severity: 'high' | 'warning';
      orderId: string;
      description: string;
    }[];
  };
}
