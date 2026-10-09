import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
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
      <a href="/" className="btn-primary mt-2 py-2.5 px-6 rounded-xl text-xs sm:text-sm shadow-2xs">
        Return to Home
      </a>
    </main>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <ToastProvider>
        <AuthProvider>
          <CartProvider>
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
                  <Route path="*"                    element={<NotFoundPage />} />
                </Routes>
              </div>
              <Footer />
            </div>
          </CartProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
