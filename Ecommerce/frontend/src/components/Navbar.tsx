import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShoppingBag, Search, User, Menu, X, ShieldCheck, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useState, useEffect, useRef } from 'react';

export function Navbar() {
  const { totalItems, openCart } = useCart();
  const { user, isAuthenticated, logout } = useAuth();
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [searchOpen, setSearchOpen]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');
  const [userMenuOpen, setUserMenuOpen]   = useState(false);
  const [scrolled, setScrolled]           = useState(false);
  const searchInputRef                    = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
    setUserMenuOpen(false);
  }, [location.pathname, location.search]);

  // Track scroll position for header shadow
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Keyboard shortcut listener (/ to open, Escape to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && !searchOpen) {
        // If not focused on an input/textarea
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          setSearchOpen(true);
        }
      } else if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [searchOpen]);

  // Autofocus search input when overlay opens
  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [searchOpen]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/products?search=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  const handleSuggestionClick = (query: string) => {
    navigate(`/products?search=${encodeURIComponent(query)}`);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const NAV_LINKS = [
    { to: '/',                                    label: 'Home' },
    { to: '/products',                            label: 'All Products' },
    { to: '/products?search=Ayurvedic',           label: 'Ayurvedic' },
    { to: '/products?search=Herbal+Extracts',     label: 'Herbal Extracts' },
    { to: '/products?search=Vitality',            label: 'Vitality' },
  ];

  return (
    <>

      {/* 2. Main Header — solid sticky header with subtle scroll shadow */}
      <header
        className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b transition-all duration-200 ${
          scrolled ? 'border-slate-200/90 shadow-sm' : 'border-slate-200/80 shadow-none'
        }`}
      >
        <nav className="page-container h-16 flex items-center justify-between gap-2 sm:gap-4">

          {/* Brand Logo */}
          <Link
            to="/"
            id="nav-logo"
            className="flex items-center gap-2.5 shrink-0 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs group-hover:bg-emerald-700 transition-colors">
              🌿
            </div>
            <span className="font-display font-bold text-xl text-slate-900 tracking-tight">
              EMS<span className="text-emerald-600"> Dispensary</span>
            </span>
          </Link>

          {/* Desktop Nav Links with proper hit targets and padding */}
          <ul className="hidden md:flex items-center gap-1 lg:gap-1.5 shrink-0">
            {NAV_LINKS.map(({ to, label }) => {
              const active =
                to === '/'
                  ? location.pathname === '/' && !location.search
                  : location.pathname + location.search === to;
              return (
                <li key={to}>
                  <Link
                    to={to}
                    className={`px-3 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      active
                        ? 'text-blue-600 bg-blue-50/80 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                    }`}
                  >
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop Search Field with fixed height and comfortable padding */}
          <div className="hidden lg:flex items-center flex-1 min-w-0 max-w-sm mx-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full h-10 flex items-center justify-between px-3.5 py-2 bg-slate-100/90 hover:bg-slate-200/70 border border-slate-200/80 rounded-xl text-slate-500 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Search catalog"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Search size={15} className="text-slate-400 shrink-0" />
                <span className="truncate">Search catalog…</span>
              </div>
              <kbd className="px-2 py-0.5 text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 rounded-md shadow-2xs shrink-0 ml-2">
                /
              </kbd>
            </button>
          </div>

          {/* Action Buttons: Search (Mobile), Cart, User Account, Hamburger */}
          {/* Action Buttons: Search (Mobile), Cart, User Account, Hamburger */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile Search Button */}
            <button
              id="nav-search-btn"
              onClick={() => setSearchOpen(true)}
              className="p-2 sm:p-2.5 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors lg:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Search products"
            >
              <Search size={18} />
            </button>

            {/* Cart Button with Count Badge */}
            <button
              id="nav-cart-btn"
              onClick={openCart}
              className="relative flex items-center gap-1.5 sm:gap-2 p-2 sm:px-3 sm:py-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              aria-label={`Shopping Cart with ${totalItems} items`}
            >
              <div className="relative">
                <ShoppingBag size={19} className="text-slate-700" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-emerald-600 text-white text-[10px] font-bold px-1 shadow-2xs">
                    {totalItems > 99 ? '99+' : totalItems}
                  </span>
                )}
              </div>
              <span className="text-xs font-semibold hidden sm:inline text-slate-700">Cart</span>
            </button>

            {/* User Account Control */}
            <div className="relative">
              {isAuthenticated ? (
                <button
                  id="nav-user-menu-btn"
                  onClick={() => setUserMenuOpen(v => !v)}
                  className="flex items-center gap-2 p-1 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="User account menu"
                >
                  <img
                    src={user?.avatar}
                    alt={user?.name}
                    className="w-8 h-8 rounded-full border border-slate-300"
                  />
                </button>
              ) : (
                <Link
                  to="/login"
                  id="nav-login-btn"
                  className="inline-flex items-center gap-1.5 py-2 px-2.5 sm:px-3.5 text-xs rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-2xs transition-colors"
                  aria-label="Sign in"
                >
                  <User size={15} />
                  <span className="hidden sm:inline">Sign In</span>
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

            {/* Mobile Menu Toggle Button */}
            <button
              id="nav-mobile-menu-btn"
              onClick={() => setMobileOpen(v => !v)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 md:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </nav>

        {/* Mobile Nav Drawer */}
        {mobileOpen && (
          <div className="md:hidden bg-white border-t border-slate-200 animate-fade-in shadow-lg">
            <div className="page-container py-4 space-y-3">
              <ul className="space-y-1">
                {NAV_LINKS.map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="block px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    to="/orders"
                    className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-100 active:bg-slate-200"
                  >
                    <span>My Orders</span>
                    <span className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-md">
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

      {/* 3. Centered Command-Palette Style Search Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-start justify-center pt-20 sm:pt-28 px-4 animate-fade-in"
          onClick={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}
          role="dialog"
          aria-modal="true"
          aria-label="Search dialog"
        >
          <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-modal-pop">
            <form onSubmit={handleSearch} className="relative flex items-center px-4 py-3.5 border-b border-slate-200/80 gap-3">
              <Search size={18} className="text-slate-400 shrink-0 ml-1" />
              <input
                ref={searchInputRef}
                id="search-overlay-input"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search products, categories, features…"
                className="w-full min-w-0 text-sm sm:text-base text-slate-900 placeholder-slate-400 bg-transparent outline-none"
              />
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Close search"
              >
                <X size={18} />
              </button>
            </form>

            <div className="p-4 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <span>Press</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-semibold shadow-2xs">Enter</kbd>
                <span>to search or</span>
                <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-semibold shadow-2xs">Esc</kbd>
                <span>to close</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 text-[11px]">Popular:</span>
                <button
                  type="button"
                  onClick={() => handleSuggestionClick('Ashwagandha')}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 hover:text-emerald-600 cursor-pointer shadow-2xs transition-colors"
                >
                  Ashwagandha
                </button>
                <button
                  type="button"
                  onClick={() => handleSuggestionClick('Triphala')}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 hover:text-emerald-600 cursor-pointer shadow-2xs transition-colors"
                >
                  Triphala
                </button>
                <button
                  type="button"
                  onClick={() => handleSuggestionClick('Tulsi')}
                  className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg hover:border-emerald-400 hover:text-emerald-600 cursor-pointer shadow-2xs transition-colors"
                >
                  Tulsi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
