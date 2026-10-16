import { BrowserRouter, Routes, Route, useLocation, NavLink } from 'react-router-dom';
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
import { WishlistProvider }      from './context/WishlistContext';
import { useCart } from './context/CartContext';
import { Home, Package, ShoppingBag, ClipboardList, User } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import clsx from 'clsx';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);
  return null;
}

function NotFoundPage() {
  return (
    <main className="min-h-[70vh] bg-slate-50 flex flex-col items-center justify-center gap-4 px-4 py-20 text-center">
      <span className="text-7xl font-display font-extrabold text-slate-900">404</span>
      <h2 className="text-xl sm:text-2xl text-slate-800 font-bold">Page Not Found</h2>
      <p className="text-xs sm:text-sm text-slate-500 max-w-sm">The destination page does not exist or may have been relocated.</p>
      <a href="/" className="mt-2 py-2.5 px-6 rounded-xl text-xs sm:text-sm shadow-2xs inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition-colors">
        Return to Home
      </a>
    </main>
  );
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
        to={isAuthenticated ? '/orders' : '/login'}
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
          <Route path="*"                    element={<NotFoundPage />} />
        </Routes>
      </div>
      <Footer />
      <MobileBottomNav />
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
