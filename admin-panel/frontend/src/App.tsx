import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider } from './context/AdminAuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardOverviewPage } from './pages/DashboardOverviewPage';
import { ProductsListPage } from './pages/ProductsListPage';
import { CategoriesListPage } from './pages/CategoriesListPage';
import { OrdersListPage } from './pages/OrdersListPage';
import { AdminUsersPage } from './pages/AdminUsersPage';

export default function App() {
  return (
    <BrowserRouter>
      <AdminAuthProvider>
        <Routes>
          {/* Public auth route */}
          <Route path="/login" element={<LoginPage />} />

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
      </AdminAuthProvider>
    </BrowserRouter>
  );
}
