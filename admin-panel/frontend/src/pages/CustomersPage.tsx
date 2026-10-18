import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  Search,
  ShoppingBag,
  IndianRupee,
  Clock,
  Phone,
  Mail,
  User,
  ArrowRight,
  X,
  Calendar,
  Package,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { subscribeAdminOrders, type AdminOrder } from '../services/adminOrderService';
import { useToast } from '../context/ToastContext';

export interface CustomerSummary {
  userId: string;
  name: string;
  email: string;
  phone: string;
  totalOrders: number;
  totalSpentPaise: number;
  lastOrderDate: string;
  orders: AdminOrder[];
}

export function CustomersPage() {
  const toast = useToast();
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSummary | null>(null);

  // Subscribe to real-time orders to build dynamic customer profiles
  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeAdminOrders(
      (liveOrders) => {
        setOrders(liveOrders);
        setLoading(false);
      },
      (err) => {
        console.error('Failed to stream customers data:', err);
        toast.error('Failed to stream real-time customer data.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Aggregate orders by customer (userId or phone fallback)
  const customers = useMemo(() => {
    const map = new Map<string, CustomerSummary>();

    for (const order of orders) {
      const contact = order.pickupContact || { fullName: 'Customer', phone: '—' };
      const key = order.userId || contact.phone || contact.fullName;
      const orderPaise = Number(order.totalPaise || order.subtotalPaise || 0);

      if (!map.has(key)) {
        map.set(key, {
          userId: order.userId || key,
          name: contact.fullName && contact.fullName !== '—' ? contact.fullName : 'Customer',
          email: order.userId?.includes('@') ? order.userId : '—',
          phone: contact.phone && contact.phone !== '—' ? contact.phone : '—',
          totalOrders: 1,
          totalSpentPaise: orderPaise,
          lastOrderDate: order.createdAt,
          orders: [order],
        });
      } else {
        const existing = map.get(key)!;
        existing.totalOrders += 1;
        existing.totalSpentPaise += orderPaise;
        existing.orders.push(order);
        if (new Date(order.createdAt).getTime() > new Date(existing.lastOrderDate).getTime()) {
          existing.lastOrderDate = order.createdAt;
          if (contact.fullName && contact.fullName !== 'Customer') {
            existing.name = contact.fullName;
          }
          if (contact.phone && contact.phone !== '—') {
            existing.phone = contact.phone;
          }
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime()
    );
  }, [orders]);

  // Filtered by search query
  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase().trim();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.userId.toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const totalRevenuePaise = customers.reduce((sum, c) => sum + c.totalSpentPaise, 0);

  const formatDate = (iso?: string) => {
    if (!iso) return 'Recent';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(iso));
    } catch {
      return String(iso);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
              Customers &amp; Users
            </h1>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Sync
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time customer directory, purchasing history, and lifetime spending
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/orders"
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <ShoppingBag size={15} />
            <span>View All Orders</span>
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Customers
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-display">
            {customers.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Unique shoppers across all orders</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Orders Generated
            </span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-teal-700 font-display">
            {orders.length}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Lifetime customer transactions</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Cumulative Volume
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <IndianRupee size={16} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-indigo-700 font-display">
            ₹{(totalRevenuePaise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">All orders gross value</p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customers by name, phone number, or email..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition"
        />
      </div>

      {/* Customers Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
        {loading ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <div className="w-7 h-7 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading customer records...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-xs">
            <Users size={32} className="mx-auto mb-2 text-slate-300" />
            No customer accounts found matching your query.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Contact Phone</th>
                  <th className="py-3 px-4 text-center">Orders</th>
                  <th className="py-3 px-4 text-right">Lifetime Spend</th>
                  <th className="py-3 px-4">Last Order</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCustomers.map((customer) => (
                  <tr key={customer.userId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center shrink-0">
                          {customer.name.slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{customer.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono truncate">{customer.userId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-600">
                      {customer.phone}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="inline-block bg-slate-100 text-slate-800 px-2 py-0.5 rounded-full font-bold text-[11px]">
                        {customer.totalOrders}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700 font-mono text-sm">
                      ₹{(customer.totalSpentPaise / 100).toFixed(0)}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500">
                      {formatDate(customer.lastOrderDate)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => setSelectedCustomer(customer)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold text-xs transition-colors"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Details Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm">
                  {selectedCustomer.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 font-display">
                    {selectedCustomer.name}
                  </h3>
                  <p className="text-xs text-slate-500">Customer Profile &amp; Order History</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            {/* Customer Summary Cards */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Contact Phone</span>
                <span className="font-bold text-slate-900 font-mono mt-0.5 block">
                  {selectedCustomer.phone}
                </span>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-slate-500 block text-[11px]">Lifetime Spend</span>
                <span className="font-bold text-emerald-700 font-mono text-sm mt-0.5 block">
                  ₹{(selectedCustomer.totalSpentPaise / 100).toFixed(0)}
                </span>
              </div>
            </div>

            {/* Orders Placed by this customer */}
            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">
                Orders ({selectedCustomer.orders.length})
              </h4>
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {selectedCustomer.orders.map((order) => (
                  <div
                    key={order.id}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900">{order.id}</span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {formatDate(order.createdAt)} · {order.items.length} items
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-slate-900 block font-mono">
                        ₹{((order.totalPaise || order.subtotalPaise || 0) / 100).toFixed(0)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {order.orderStatus}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
