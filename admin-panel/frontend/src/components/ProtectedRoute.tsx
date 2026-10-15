import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { AccessDeniedPage } from '../pages/AccessDeniedPage';

export function ProtectedRoute() {
  const { rawUser, isAdmin, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-9 h-9 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="text-xs font-semibold text-slate-500">Verifying administrator credentials...</p>
      </div>
    );
  }

  // If not authenticated with Firebase Auth at all, redirect to login
  if (!rawUser) {
    return <Navigate to="/login" replace />;
  }

  // If authenticated but lacks admin claim, show access denied
  if (!isAdmin) {
    return <AccessDeniedPage />;
  }

  return <Outlet />;
}
