export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  originalPrice?: number;
  images: string[];
  category: string;
  subCategory?: string;
  rating: number;
  reviewCount: number;
  stock: number;
  tags: string[];
  featured?: boolean;
  isNew?: boolean;
  discount?: number;
  // Optional: kept for backward compat with existing data files
  colors?: string[];
  sizes?: string[];
  prepaidOnly?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  // Optional: kept for backward compat with cartService and CartDrawer
  selectedColor?: string;
  selectedSize?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
}

export interface Category {
  id: string;
  name: string;
  icon: string;
  count: number;
  color: string;
}

export interface Review {
  id: string;
  productId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  avatar?: string;
}

export type SortOption = 'featured' | 'price-asc' | 'price-desc' | 'rating' | 'newest';

export interface FilterState {
  categories: string[];
  priceRange: [number, number];
  rating: number;
  inStock: boolean;
  sortBy: SortOption;
  search: string;
}

// Click-and-Collect order statuses (new statuses + legacy compat)
export type OrderStatus =
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready_for_pickup'
  | 'collected'
  | 'cancelled'
  // Legacy statuses (kept for backward compat with existing mock data)
  | 'processing'
  | 'shipped'
  | 'delivered';

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface OrderItem {
  product: Product;
  quantity: number;
  // Optional: kept for backward compat
  selectedColor?: string;
  selectedSize?: string;
  price: number;
}

export interface OrderTimelineStep {
  title: string;
  description: string;
  timestamp: string;
  completed: boolean;
}

export interface PickupContact {
  fullName: string;
  phone: string;
  notes?: string;
}

export interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  statusLabel: string;
  paymentStatus?: PaymentStatus;
  items: OrderItem[];
  subtotal: number;
  total: number;
  // Click-and-Collect fields
  pickupContact?: PickupContact;
  pickupLocation?: string;
  pickupCode?: string;
  timeline: OrderTimelineStep[];
  // Legacy shipping fields (kept for backward compat with existing pages/data)
  shipping?: number;
  tax?: number;
  shippingAddress?: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
    email?: string;
  };
  paymentMethod?: {
    brand?: string;
    last4?: string;
    type?: string;
    demoNote?: string;
  };
  trackingNumber?: string;
  courier?: string;
  estimatedDelivery?: string;
}

// Checkout types for Click-and-Collect
export interface CheckoutPickupInfo {
  fullName: string;
  phone: string;
  notes: string;
}

// Legacy checkout payment type (kept for backward compat)
export type PaymentMethodId = 'upi' | 'card' | 'netbanking' | 'cod' | 'click_and_collect';

export interface CheckoutPaymentInfo {
  method: PaymentMethodId;
  methodLabel: string;
  upiOption?: 'qr' | 'id' | 'apps';
  upiId?: string;
  upiApp?: string;
  bankName?: string;
  codFee: number;
  totalWithCod: number;
  confirmationStatus: 'confirmed' | 'demo_confirmed' | string;
}
