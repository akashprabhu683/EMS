import { Link, useLocation } from 'react-router-dom';
import { ShoppingBag, User, Menu, X, ArrowRight, Leaf, Heart } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { NotificationCenter } from './NotificationCenter';
import { useState, useEffect, useRef } from 'react';

export function Navbar() {
  const { totalItems, openCart } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const { favoritesCount } = useWishlist();
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [scrolled, setScrolled]         = useState(false);
  const location  = useLocation();
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname, location.search]);

  // Track scroll for header shadow
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close user menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const NAV_LINKS = [
    { to: '/',                 label: 'Home' },
    { to: '/products',         label: 'All Products' },
    { to: '/#catalog-section', label: 'Catalog' },
    { to: '/#how-it-works',    label: 'How It Works' },
    { to: '/#store-info',      label: 'Store Info' },
  ];

  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      return window.location.hash ? `/#${window.location.hash.replace('#', '')}` : '/';
    }
    return '';
  });

  // Track active section in real-time on scroll when on the home page
  useEffect(() => {
    if (location.pathname !== '/') {
      setActiveSection('');
      return;
    }

    const computeActiveSection = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const docHeight = document.documentElement.scrollHeight;

      // If user is scrolled near the bottom of the page, activate the last section (#store-info)
      if (scrollY + viewportHeight >= docHeight - 120) {
        setActiveSection('/#store-info');
        return;
      }

      // Check if user is near the top hero banner before catalog
      const catalogEl = document.getElementById('catalog-section');
      if (catalogEl) {
        const catRect = catalogEl.getBoundingClientRect();
        if (catRect.top > 160) {
          setActiveSection('/');
          return;
        }
      } else if (scrollY < 200) {
        setActiveSection('/');
        return;
      }

      // Check sections from bottom to top
      const sections = ['store-info', 'how-it-works', 'catalog-section'];
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          // Navbar is 64px, section is active when top is within upper viewport and bottom is still visible
          if (rect.top <= 160 && rect.bottom >= 80) {
            setActiveSection(`/#${id}`);
            return;
          }
        }
      }
    };

    computeActiveSection();
    window.addEventListener('scroll', computeActiveSection, { passive: true });
    window.addEventListener('resize', computeActiveSection, { passive: true });
    return () => {
      window.removeEventListener('scroll', computeActiveSection);
      window.removeEventListener('resize', computeActiveSection);
    };
  }, [location.pathname]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, to: string) => {
    if (to === '/') {
      if (location.pathname === '/') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setActiveSection('/');
        window.history.pushState(null, '', '/');
      }
    } else if (to.includes('#')) {
      const hash = to.split('#')[1];
      if (location.pathname === '/') {
        e.preventDefault();
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth' });
          setActiveSection(to);
          window.history.pushState(null, '', `#${hash}`);
        }
      }
    }
  };

  const isLinkActive = (to: string) => {
    if (location.pathname === '/') {
      if (to === '/') {
        return !activeSection || activeSection === '/';
      }
      return activeSection === to;
    }
    if (to === '/products') {
      return location.pathname.startsWith('/product');
    }
    return location.pathname === to;
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-b transition-all duration-200 ${
          scrolled ? 'border-slate-200/90 shadow-sm' : 'border-slate-200/80 shadow-none'
        }`}
      >
        <nav className="page-container h-16 flex items-center justify-between gap-2 sm:gap-6">

        {/* Brand Logo - clean without emojis */}
        <Link
          to="/"
          id="nav-logo"
          className="flex items-center gap-2 sm:gap-2.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-lg min-w-0"
        >
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-2xs group-hover:bg-emerald-800 transition-colors shrink-0">
            <Leaf size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-base sm:text-xl text-slate-900 tracking-tight truncate">
            THANGAM<span className="text-emerald-700"> STORES</span>
          </span>
        </Link>

        {/* Desktop Nav Links - with clean green underline indicators */}
        <ul className="hidden md:flex items-center gap-1 sm:gap-2 lg:gap-4 shrink-0">
          {NAV_LINKS.map(({ to, label }) => {
            const active = isLinkActive(to);
            return (
              <li key={to}>
                <Link
                  to={to}
                  onClick={(e) => handleNavClick(e, to)}
                  className={`relative py-2 px-2.5 text-sm font-semibold transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 group flex items-center justify-center ${
                    active
                      ? 'text-emerald-800'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  <span>{label}</span>
                  {/* Underline green indicator */}
                  <span
                    className={`absolute bottom-0 left-1.5 right-1.5 h-[2.5px] rounded-full transition-all duration-200 ${
                      active
                        ? 'bg-emerald-600 opacity-100 scale-x-100'
                        : 'bg-emerald-600/40 opacity-0 scale-x-0 group-hover:opacity-100 group-hover:scale-x-100'
                    }`}
                  />
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Actions: Wishlist, Cart, User, Hamburger */}
        <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
          {/* Wishlist Button - clean without count badge */}
          <Link
            to="/favorites"
            id="nav-wishlist-btn"
            className="flex items-center justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
            aria-label="My Favourites"
          >
            <Heart size={18} className="text-slate-700" />
            <span className="text-xs font-semibold hidden lg:inline text-slate-700 ml-1.5">Favourites</span>
          </Link>

          <button
            id="nav-cart-btn"
            onClick={openCart}
            className="relative flex items-center justify-center w-9 h-9 sm:w-auto sm:h-auto sm:px-3 sm:py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-200/80 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
            aria-label={`Shopping Cart with ${totalItems} items`}
          >
            <div className="relative flex items-center justify-center">
              <ShoppingBag size={18} className="text-slate-700" />
              {totalItems > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full bg-emerald-700 text-white text-[9px] font-bold px-0.5 shadow-2xs">
                  {totalItems > 99 ? '99+' : totalItems}
                </span>
              )}
            </div>
            <span className="text-xs font-semibold hidden sm:inline text-slate-700 ml-1.5">Cart</span>
          </button>

          <NotificationCenter />

          <div className="relative shrink-0" ref={userMenuRef}>
            {isAuthenticated ? (
              <button
                id="nav-user-menu-btn"
                onClick={() => setUserMenuOpen(v => !v)}
                className="w-9 h-9 flex items-center justify-center p-0.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                aria-label="User account menu"
              >
                <img
                  src={user?.avatar}
                  alt={user?.name || 'Customer profile avatar'}
                  width={28}
                  height={28}
                  className="w-7 h-7 rounded-full border border-slate-300 object-cover"
                />
              </button>
            ) : (
              <Link
                to="/login"
                id="nav-login-btn"
                className="inline-flex items-center justify-center h-9 px-2.5 sm:px-4 text-xs rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 text-white font-semibold shadow-2xs transition-colors shrink-0"
                aria-label="Sign in"
              >
                <User size={15} />
                <span className="hidden sm:inline ml-1.5">Sign In</span>
              </Link>
            )}

            {userMenuOpen && isAuthenticated && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-slate-200 rounded-xl p-1.5 shadow-lg animate-fade-in z-50">
                <div className="px-3 py-2 border-b border-slate-100">
                  <p className="text-xs font-semibold text-slate-900 truncate">{user?.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <Link
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <span>My Profile</span>
                    <ArrowRight size={12} className="text-slate-400" />
                  </Link>
                  <Link
                    to="/favorites"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Heart size={13} className="text-rose-500" />
                      <span>My Favourites</span>
                    </div>
                    <ArrowRight size={12} className="text-slate-400" />
                  </Link>
                  <Link
                    to="/orders"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <span>My Orders</span>
                    <ArrowRight size={12} className="text-slate-400" />
                  </Link>
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <button
                    onClick={() => { logout(); setUserMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            id="nav-mobile-menu-btn"
            onClick={() => setMobileOpen(v => !v)}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 shrink-0"
            aria-label="Toggle navigation menu"
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </nav>

      {/* Mobile Nav Drawer */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-200 animate-fade-in shadow-lg">
          <div className="page-container py-4 space-y-3">
            <ul className="space-y-1">
              {NAV_LINKS.map(({ to, label }) => {
                const active = isLinkActive(to);
                return (
                  <li key={to}>
                    <Link
                      to={to}
                      onClick={(e) => {
                        handleNavClick(e, to);
                        setMobileOpen(false);
                      }}
                      className={`relative flex items-center justify-between px-3.5 py-2.5 text-sm font-semibold transition-colors ${
                        active
                          ? 'text-emerald-800'
                          : 'text-slate-700 hover:text-emerald-700'
                      }`}
                    >
                      <span>{label}</span>
                      {active && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 shadow-2xs" />
                      )}
                      <span
                        className={`absolute bottom-0 left-3.5 right-3.5 h-[2px] rounded-full transition-all duration-200 ${
                          active ? 'bg-emerald-600 opacity-100' : 'bg-transparent opacity-0'
                        }`}
                      />
                    </Link>
                  </li>
                );
              })}
              <li>
                <Link
                  to="/favorites"
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                >
                  <span className="flex items-center gap-2">
                    <Heart size={16} className="text-slate-500" />
                    <span>My Favourites</span>
                  </span>
                </Link>
              </li>
              <li>
                <Link
                  to="/orders"
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                >
                  <span>My Orders</span>
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-md">
                    History
                  </span>
                </Link>
              </li>
            </ul>
            <div className="pt-3 border-t border-slate-100">
              {isAuthenticated ? (
                <div className="space-y-2">
                  <div className="px-3.5 py-1 text-xs text-slate-500">
                    Signed in as <strong className="text-slate-800">{user?.name}</strong>
                  </div>
                  <button
                    onClick={logout}
                    className="w-full py-2.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-xl text-left px-3.5"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  className="btn-primary w-full text-xs py-2.5 justify-center rounded-xl"
                >
                  Sign In to Account
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
    {/* Spacer to prevent fixed header from overlapping page content */}
    <div className="h-16 w-full shrink-0" aria-hidden="true" />
  </>
  );
}
