import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Package, Search, ChevronRight, Download, Truck, CheckCircle2, Clock, ArrowRight, ShieldCheck } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import { getUserOrders } from '../services/orderService';
import type { OrderStatus, Order } from '../types';

export function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const toast = useToast();

  useEffect(() => {
    let active = true;
    if (user?.id) {
      getUserOrders(user.id)
        .then(res => {
          if (active) setOrders(res);
        })
        .catch(console.error)
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => { active = false; };
  }, [user?.id]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesStatus = filterStatus === 'all' || order.status === filterStatus;
      const matchesQuery =
        searchQuery.trim() === '' ||
        order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.items.some(i => i.product.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        Boolean(order.trackingNumber && order.trackingNumber.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesStatus && matchesQuery;
    });
  }, [orders, filterStatus, searchQuery]);

  const handleDownloadInvoice = (order: typeof orders[0], e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toast.success(`Invoice for ${order.id} downloaded.`);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'ready_for_pickup':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>Ready for Pickup</span>
          </span>
        );
      case 'collected':
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={13} className="text-emerald-600" />
            <span>{status === 'collected' ? 'Collected' : 'Delivered'}</span>
          </span>
        );
      case 'accepted':
      case 'preparing':
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={13} className="text-amber-600" />
            <span>{status === 'preparing' ? 'Preparing' : status === 'accepted' ? 'Accepted' : 'Processing'}</span>
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Truck size={13} className="text-blue-600" />
            <span>In Transit</span>
          </span>
        );
      case 'placed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock size={13} className="text-blue-600" />
            <span>Order Placed</span>
          </span>
        );
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
            <span>Cancelled</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 overflow-x-clip">
      <div className="page-container py-8 sm:py-12">

        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-2 text-xs text-slate-500 mb-6" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-slate-900 transition-colors">Home</Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">Orders</span>
        </nav>

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="badge-clean bg-blue-100 text-blue-700 text-xs font-bold">
                Account Center
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight">
              Order History
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              View, track, and download invoices for all your recent purchases.
            </p>
          </div>

          <Link
            to="/products"
            className="btn-primary py-2.5 px-5 text-xs sm:text-sm rounded-xl self-start sm:self-auto shrink-0 shadow-2xs"
          >
            <span>Explore Catalog</span>
            <ArrowRight size={15} />
          </Link>
        </div>

        {/* Filter & Search Bar Controls */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'delivered', label: 'Delivered' },
              { id: 'shipped', label: 'In Transit' },
              { id: 'processing', label: 'Processing' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  filterStatus === tab.id
                    ? 'bg-blue-600 text-white shadow-2xs'
                    : 'bg-slate-100/80 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative min-w-[240px] max-w-sm">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by order ID or item..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all text-slate-800"
            />
          </div>
        </div>

        {/* Orders Listing */}
        {filteredOrders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center shadow-xs space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
              <Package size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-900">No matching orders found</h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
              We couldn't locate any orders matching your current filter criteria.
            </p>
            <button
              onClick={() => { setFilterStatus('all'); setSearchQuery(''); }}
              className="btn-secondary py-2.5 px-5 text-xs rounded-xl inline-flex mt-2"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5">
            {filteredOrders.map(order => (
              <div
                key={order.id}
                className="bento-card bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 sm:p-6 shadow-2xs transition-all"
              >
                {/* Order Top Meta */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono font-bold text-xs sm:text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                      {order.id}
                    </span>
                    <span className="text-xs text-slate-400">·</span>
                    <span className="text-xs text-slate-500 font-medium">
                      Placed on {order.date}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    {getStatusBadge(order.status)}
                    <span className="text-xs sm:text-sm font-bold text-slate-900 font-display">
                      ${order.total.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Items & Delivery Info */}
                <div className="py-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Items list column */}
                  <div className="md:col-span-8 space-y-3">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3.5">
                        <img
                          src={item.product.images[0]}
                          alt={item.product.name}
                          className="w-14 h-14 rounded-xl object-cover bg-slate-100 border border-slate-100 shrink-0"
                          loading="lazy"
                        />
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/product/${item.product.id}`}
                            className="text-xs sm:text-sm font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate block"
                          >
                            {item.product.name}
                          </Link>
                          <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                            <span>Qty: {item.quantity}</span>
                            {item.selectedSize && <span>· Size: {item.selectedSize}</span>}
                            <span>· ${item.price.toFixed(2)} each</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Courier & Tracking column */}
                  <div className="md:col-span-4 bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Courier:</span>
                      <strong className="text-slate-800 font-semibold">{order.courier}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-500">
                      <span>Tracking:</span>
                      <span className="font-mono text-[11px] text-slate-700 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {order.trackingNumber}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 pt-1 border-t border-slate-200/60">
                      <span>Status:</span>
                      <span className="text-slate-900 font-semibold">{order.estimatedDelivery}</span>
                    </div>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-emerald-600" />
                    <span>Protected by 30-day money back guarantee</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={(e) => handleDownloadInvoice(order, e)}
                      className="btn-secondary py-2 px-3.5 text-xs rounded-xl gap-1.5 shadow-2xs"
                    >
                      <Download size={13} />
                      <span>Download Invoice</span>
                    </button>

                    <Link
                      to={`/orders/${order.id}`}
                      className="btn-primary py-2 px-4 text-xs rounded-xl gap-1.5 shadow-2xs"
                    >
                      <span>View Details</span>
                      <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>

              </div>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
