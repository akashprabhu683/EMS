import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Package,
  Layers,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Plus,
} from 'lucide-react';
import { getAllProducts } from '../services/adminProductService';
import { getAllCategories } from '../services/adminCategoryService';
import type { Product, Category } from '../types';

export function DashboardOverviewPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      try {
        const [prodList, catList] = await Promise.all([
          getAllProducts(),
          getAllCategories(),
        ]);
        if (active) {
          setProducts(prodList);
          setCategories(catList);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to load dashboard metrics.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadStats();
    return () => {
      active = false;
    };
  }, []);

  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.isActive).length;
  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= 5).length;
  const totalCategories = categories.length;
  const activeCategories = categories.filter((c) => c.isActive).length;

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs font-semibold text-slate-500">Loading dashboard metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
            System Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Real-time catalog and inventory status from Cloud Firestore
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/products"
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center gap-2 shadow-2xs transition-colors"
          >
            <Plus size={16} />
            <span>Manage Products</span>
          </Link>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm">
          {error}
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Products */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Total Products
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Package size={17} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
            {totalProducts}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {activeProducts} active in storefront
          </p>
        </div>

        {/* Active Products */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Live in Store
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-emerald-600 font-display tracking-tight">
            {activeProducts}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {totalProducts - activeProducts} currently inactive
          </p>
        </div>

        {/* Low Stock */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Low Stock Alerts
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <AlertTriangle size={17} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-amber-600 font-display tracking-tight">
            {lowStockProducts}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            ≤ 5 items remaining in stock
          </p>
        </div>

        {/* Categories */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Categories
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Layers size={17} />
            </div>
          </div>
          <div className="text-3xl font-extrabold text-slate-900 font-display tracking-tight">
            {totalCategories}
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            {activeCategories} active categories
          </p>
        </div>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
        <Link
          to="/products"
          className="group block bg-white rounded-2xl p-6 border border-slate-200 hover:border-emerald-400 hover:shadow-md transition-all shadow-2xs"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                <Package size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                Product Catalog Management
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Add, edit, and toggle active/inactive status of products. Set stock and pricing in rupees.
              </p>
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-emerald-700 transition-colors" />
          </div>
        </Link>

        <Link
          to="/categories"
          className="group block bg-white rounded-2xl p-6 border border-slate-200 hover:border-indigo-400 hover:shadow-md transition-all shadow-2xs"
        >
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <Layers size={22} />
              </div>
              <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                Category Taxonomies
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Organize products with unique slugs and names. Safely activate or deactivate categories.
              </p>
            </div>
            <ArrowRight size={18} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
          </div>
        </Link>
      </div>
    </div>
  );
}
