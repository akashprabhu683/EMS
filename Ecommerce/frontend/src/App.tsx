import { BrowserRouter, Routes, Route, useLocation, NavLink, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { CartProvider } from './context/CartContext';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { Navbar }     from './components/Navbar';
import { Footer }     from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { HomePage }              from './pages/HomePage';
import { ProductsPage }          from './pages/ProductsPage';
import { ProductDetailPage }     from './pages/ProductDetailPage';
import { LoginPage }             from './pages/LoginPage';
import { CheckoutPage }          from './pages/CheckoutPage';
import { OrderConfirmationPage } from './pages/OrderConfirmationPage';
import { OrdersPage }            from './pages/OrdersPage';
import { OrderDetailPage }       from './pages/OrderDetailPage';
import { AboutPage }             from './pages/AboutPage';
import { PrivacyPolicyPage }     from './pages/PrivacyPolicyPage';
import { TermsPage }             from './pages/TermsPage';
import { ClickCollectPage }      from './pages/ClickCollectPage';
import { FaqPage }               from './pages/FaqPage';
import { ContactPage }           from './pages/ContactPage';
import { ProfilePage }           from './pages/ProfilePage';
import { FavoritesPage }         from './pages/FavoritesPage';
import { NotFoundPage }          from './pages/NotFoundPage';
import { CookieConsent }         from './components/CookieConsent';
import { WishlistProvider }      from './context/WishlistContext';
import { useCart } from './context/CartContext';
import { Home, Package, ShoppingBag, ClipboardList, User } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { trackPageView } from './utils/analytics';
import clsx from 'clsx';

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const id = hash.replace('#', '');
      const el = document.getElementById(id);
      if (el) {
        // Small delay to ensure DOM is ready after navigation
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth' });
        }, 50);
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    // Track page view event
    setTimeout(() => {
      trackPageView(document.title, pathname);
    }, 100);
  }, [pathname, hash]);
  return null;
}

/* ── Android-style Mobile Bottom Navigation Bar ── */
function MobileBottomNav() {
  const { totalItems, openCart } = useCart();
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Hide on checkout and login pages
  const hiddenPaths = ['/checkout', '/login', '/register', '/order-confirmation'];
  if (hiddenPaths.includes(location.pathname)) return null;

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    clsx(
      'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-semibold transition-colors',
      isActive
        ? 'text-emerald-700 bg-emerald-50'
        : 'text-slate-500 hover:text-emerald-700'
    );

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 flex items-center justify-around px-2 py-1 safe-area-pb shadow-lg"
      aria-label="Mobile navigation"
    >
      <NavLink to="/" end className={linkClass} aria-label="Home">
        <Home size={20} />
        <span>Home</span>
      </NavLink>

      <NavLink to="/products" className={linkClass} aria-label="Products">
        <Package size={20} />
        <span>Products</span>
      </NavLink>

      <button
        onClick={openCart}
        className={clsx(
          'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-semibold transition-colors relative',
          'text-slate-500 hover:text-emerald-700'
        )}
        aria-label={`Cart (${totalItems} items)`}
      >
        <div className="relative">
          <ShoppingBag size={20} />
          {totalItems > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] flex items-center justify-center rounded-full bg-emerald-600 text-white text-[9px] font-bold">
              {totalItems > 99 ? '99+' : totalItems}
            </span>
          )}
        </div>
        <span>Cart</span>
      </button>

      <NavLink to="/orders" className={linkClass} aria-label="My orders">
        <ClipboardList size={20} />
        <span>Orders</span>
      </NavLink>

      <NavLink
        to={isAuthenticated ? '/profile' : '/login'}
        className={linkClass}
        aria-label="Account"
      >
        <User size={20} />
        <span>Account</span>
      </NavLink>
    </nav>
  );
}

function AppLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <Navbar />
      <CartDrawer />
      <div className="flex-1">
        <Routes>
          <Route path="/"                    element={<HomePage />} />
          <Route path="/products"            element={<ProductsPage />} />
          <Route path="/product/:id"         element={<ProductDetailPage />} />
          <Route path="/products/:id"        element={<ProductDetailPage />} />
          <Route path="/login"               element={<LoginPage initialMode="login" />} />
          <Route path="/register"            element={<LoginPage initialMode="register" />} />
          <Route path="/orders"              element={<OrdersPage />} />
          <Route path="/orders/:orderId"     element={<OrderDetailPage />} />
          <Route path="/checkout"            element={<CheckoutPage />} />
          <Route path="/order-confirmation"  element={<OrderConfirmationPage />} />
          <Route path="/about"               element={<AboutPage />} />
          <Route path="/privacy"             element={<PrivacyPolicyPage />} />
          <Route path="/terms"               element={<TermsPage />} />
          <Route path="/click-collect"       element={<ClickCollectPage />} />
          <Route path="/faq"                 element={<FaqPage />} />
          <Route path="/contact"             element={<ContactPage />} />
          <Route path="/profile"             element={<ProfilePage />} />
          <Route path="/account"             element={<Navigate to="/profile" replace />} />
          <Route path="/favorites"           element={<FavoritesPage />} />
          <Route path="/wishlist"            element={<FavoritesPage />} />
          <Route path="*"                    element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
      <MobileBottomNav />
      <CookieConsent />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <WishlistProvider>
            <CartProvider>
              <AppLayout />
            </CartProvider>
          </WishlistProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
