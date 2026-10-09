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
  colors?: string[];
  sizes?: string[];
  prepaidOnly?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedColor?: string;
  selectedSize?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
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

export type OrderStatus = 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderItem {
  product: Product;
  quantity: number;
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

export interface Order {
  id: string;
  date: string;
  status: OrderStatus;
  statusLabel: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  shippingAddress: {
    fullName: string;
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
    email?: string;
  };
  paymentMethod: {
    brand: string;
    last4: string;
    demoNote: string;
  };
  trackingNumber: string;
  courier: string;
  estimatedDelivery: string;
  timeline: OrderTimelineStep[];
}

export type PaymentMethodId = 'upi' | 'card' | 'netbanking' | 'cod';

export interface CheckoutPaymentInfo {
  method: PaymentMethodId;
  methodLabel: string;
  upiOption?: 'qr' | 'id' | 'apps';
  upiId?: string;
  upiApp?: string;
  bankName?: string;
  codFee: number;
  totalWithCod: number;
  confirmationStatus: string;
}


