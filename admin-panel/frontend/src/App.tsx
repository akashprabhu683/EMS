import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardOverviewPage } from './pages/DashboardOverviewPage';
import { ProductsListPage } from './pages/ProductsListPage';
import { CategoriesListPage } from './pages/CategoriesListPage';
import { OrdersListPage } from './pages/OrdersListPage';
import { AdminUsersPage } from './pages/AdminUsersPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public auth routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/accept-invite" element={<AcceptInvitePage />} />

            {/* All admin routes — protected by Firebase Auth + admin custom claim */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route index element={<DashboardOverviewPage />} />
                <Route path="/orders" element={<OrdersListPage />} />
                <Route path="/products" element={<ProductsListPage />} />
                <Route path="/categories" element={<CategoriesListPage />} />
                <Route path="/admins" element={<AdminUsersPage />} />
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
