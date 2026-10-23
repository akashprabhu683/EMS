import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Layers,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  ExternalLink,
  ShoppingCart,
  Users,
  User,
  BarChart3,
  History,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import clsx from 'clsx';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard Overview — EMS Dispensary Admin',
  '/orders': 'Order Queue & Verification — EMS Dispensary Admin',
  '/customers': 'Customer Directory — EMS Dispensary Admin',
  '/products': 'Product Management — EMS Dispensary Admin',
  '/categories': 'Category Management — EMS Dispensary Admin',
  '/reports': 'Operational & Financial Reports — EMS Dispensary Admin',
  '/audit-logs': 'Administrative Audit Trail — EMS Dispensary Admin',
  '/admins': 'Admin Team & Roles — EMS Dispensary Admin',
  '/profile': 'My Profile — EMS Dispensary Admin',
};

export function Layout() {
  const { user, logout } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const title = ROUTE_TITLES[location.pathname] || 'EMS Dispensary Admin Portal';
    document.title = title;
  }, [location.pathname]);

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    { label: 'Dashboard', to: '/', icon: LayoutDashboard },
    { label: 'Orders', to: '/orders', icon: ShoppingCart },
    { label: 'Customers', to: '/customers', icon: Users },
    { label: 'Products', to: '/products', icon: Package },
    { label: 'Categories', to: '/categories', icon: Layers },
    { label: 'Reports', to: '/reports', icon: BarChart3 },
    { label: 'Audit Trail', to: '/audit-logs', icon: History },
    { label: 'Admin Roles', to: '/admins', icon: ShieldCheck },
    { label: 'My Profile', to: '/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <header className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shadow-xs">
            <ShieldCheck size={18} />
          </div>
          <span className="font-extrabold text-sm text-slate-900 font-display">EMS Admin</span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100"
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:translate-x-0',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand Banner */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center shadow-xs">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h2 className="font-extrabold text-base text-slate-900 tracking-tight font-display">
                EMS Dispensary
              </h2>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Management Portal
              </p>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 min-h-0 p-4 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all',
                  isActive
                    ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )
              }
            >
              <item.icon size={18} className="flex-shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Card & Sign Out - Always pinned to bottom */}
        <div className="p-4 border-t border-slate-100 space-y-3 shrink-0 mt-auto bg-white">
          <NavLink
            to="/profile"
            onClick={() => setMobileMenuOpen(false)}
            className="block bg-slate-50 hover:bg-slate-100 rounded-xl p-3 border border-slate-200/70 transition-colors group"
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse" />
                <span className="text-[11px] font-bold text-slate-700">Administrator</span>
              </div>
              <span className="text-[10px] text-slate-400 group-hover:text-emerald-700 font-semibold">Profile →</span>
            </div>
            <p className="text-xs font-medium text-slate-900 truncate" title={user?.email ?? ''}>
              {user?.email ?? 'admin'}
            </p>
          </NavLink>

          <button
            id="admin-logout-btn"
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors border border-transparent hover:border-rose-100 cursor-pointer"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Mobile backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/30 backdrop-blur-2xs md:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}
