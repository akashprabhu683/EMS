import React, { useEffect, useState, useMemo } from 'react';
import {
  Package,
  Plus,
  Search,
  Filter,
  Edit2,
  Power,
  X,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  getAllProducts,
  createProduct,
  updateProduct,
  setProductActiveStatus,
  paiseToRupees,
} from '../services/adminProductService';
import { getAllCategories } from '../services/adminCategoryService';
import { ConfirmationModal } from '../components/ConfirmationModal';
import type { Product, Category, ProductFormData } from '../types';

export function ProductsListPage() {
  const toast = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<ProductFormData>({
    name: '',
    description: '',
    categoryId: '',
    priceRupees: '',
    imageUrl: '',
    stock: '0',
    isActive: true,
  });

  // Deactivation confirmation modal
  const [deactivateProduct, setDeactivateProduct] = useState<Product | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);

  // Load data
  const loadData = async () => {
    setLoading(true);
    try {
      const [prodList, catList] = await Promise.all([
        getAllProducts(),
        getAllCategories(),
      ]);
      setProducts(prodList);
      setCategories(catList);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load products from database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? p.isActive
          : !p.isActive;
      const matchesCategory =
        categoryFilter === 'all' ? true : p.categoryId === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [products, searchQuery, statusFilter, categoryFilter]);

  // Map categoryId to category name
  const categoryMap = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => {
      map.set(c.id, c.name);
      if (c.slug) {
        map.set(c.slug, c.name);
        map.set(c.slug.replace(/-/g, ''), c.name);
        map.set(c.slug.split('-')[0], c.name);
      }
    });
    return map;
  }, [categories]);

  // Open modal for new product
  const handleOpenCreateModal = () => {
    setEditingProduct(null);
    setModalError(null);
    setFormData({
      name: '',
      description: '',
      categoryId: categories.find((c) => c.isActive)?.id || (categories[0]?.id ?? ''),
      priceRupees: '',
      imageUrl: '',
      stock: '10',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEditModal = (prod: Product) => {
    setEditingProduct(prod);
    setModalError(null);
    setFormData({
      name: prod.name,
      description: prod.description,
      categoryId: prod.categoryId,
      priceRupees: paiseToRupees(prod.price),
      imageUrl: prod.imageUrl || '',
      stock: prod.stock.toString(),
      isActive: prod.isActive,
    });
    setIsModalOpen(true);
  };

  // Submit product create/edit
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);

    try {
      if (editingProduct) {
        await updateProduct(editingProduct.id, formData);
        toast.success(`Product "${formData.name}" successfully updated.`);
      } else {
        await createProduct(formData);
        toast.success(`Product "${formData.name}" successfully created.`);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save product.');
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle active status
  const handleToggleActiveClick = (prod: Product) => {
    if (prod.isActive) {
      // Require confirmation to deactivate
      setDeactivateProduct(prod);
    } else {
      // Directly activate
      executeStatusChange(prod, true);
    }
  };

  const executeStatusChange = async (prod: Product, newStatus: boolean) => {
    try {
      await setProductActiveStatus(prod.id, newStatus);
      toast.success(`Product "${prod.name}" has been ${newStatus ? 'activated' : 'deactivated'}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to change product status.');
    } finally {
      setDeactivateProduct(null);
      setIsDeactivating(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateProduct) return;
    setIsDeactivating(true);
    await executeStatusChange(deactivateProduct, false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
            Product Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Create, update, and manage products synchronized with Cloud Firestore
          </p>
        </div>

        <button
          id="btn-create-product"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-2xs transition-colors self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>New Product</span>
        </button>
      </div>


      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            id="product-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search products by title..."
            className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status:</span>
          <select
            id="product-status-filter"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 outline-none focus:border-emerald-600"
          >
            <option value="all">All Products</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Category:</span>
          <select
            id="product-category-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 outline-none focus:border-emerald-600"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading catalog from Firestore...</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Package size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No products found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {products.length === 0
                ? 'Your Firestore database currently has no products. Click "New Product" above to create your first item.'
                : 'No products match your current search and filter settings.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Item</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Price (₹)</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredProducts.map((p) => {
                  const catName = categoryMap.get(p.categoryId) || p.categoryId || 'Uncategorized';
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      {/* Product Name & Thumbnail */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex-shrink-0 flex items-center justify-center">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Package size={18} className="text-slate-300" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate max-w-[220px]" title={p.name}>
                              {p.name}
                            </p>
                            <span className="font-mono text-[10px] text-slate-400 truncate block">
                              ID: {p.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4 font-medium text-slate-600">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                          {catName}
                        </span>
                      </td>

                      {/* Price in Rupees */}
                      <td className="py-3.5 px-4 font-bold text-slate-900 font-display">
                        ₹{paiseToRupees(p.price)}
                        <span className="block text-[10px] font-mono text-slate-400 font-normal">
                          {p.price} paise
                        </span>
                      </td>

                      {/* Stock */}
                      <td className="py-3.5 px-4 font-medium">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                            p.stock === 0
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : p.stock <= 5
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'text-slate-700'
                          }`}
                        >
                          {p.stock === 0 ? 'Out of stock' : `${p.stock} units`}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            p.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-500 border border-slate-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {p.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>

                      {/* Action buttons */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenEditModal(p)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Edit product"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleToggleActiveClick(p)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              p.isActive
                                ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                                : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                            }`}
                            title={p.isActive ? 'Deactivate product' : 'Activate product'}
                          >
                            <Power size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal for Deactivation */}
      <ConfirmationModal
        isOpen={Boolean(deactivateProduct)}
        title="Deactivate Product"
        message={`Are you sure you want to deactivate "${deactivateProduct?.name}"? Deactivated products are immediately excluded from the storefront.`}
        confirmLabel="Deactivate"
        confirmVariant="warning"
        isLoading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateProduct(null)}
      />

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 font-display">
                  {editingProduct ? 'Edit Product' : 'Create New Product'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stored directly in Firestore <code className="font-mono text-emerald-700">products</code> collection
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle size={15} className="flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Product Name *
                </label>
                <input
                  id="modal-product-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Ashwagandha Ghanvati"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Category *
                </label>
                <select
                  id="modal-product-category"
                  required
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600"
                >
                  <option value="" disabled>Select category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {!c.isActive ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price & Stock Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Price in INR (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 text-xs font-bold">
                      ₹
                    </span>
                    <input
                      id="modal-product-price"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={formData.priceRupees}
                      onChange={(e) => setFormData({ ...formData, priceRupees: e.target.value })}
                      placeholder="299.00"
                      className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 font-mono"
                    />
                  </div>
                  {formData.priceRupees && !isNaN(parseFloat(formData.priceRupees)) && (
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      Stored as {Math.round(parseFloat(formData.priceRupees) * 100)} paise
                    </span>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Stock Inventory *
                  </label>
                  <input
                    id="modal-product-stock"
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    placeholder="25"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 font-mono"
                  />
                </div>
              </div>

              {/* Image URL */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Image URL (HTTPS link)
                </label>
                <input
                  id="modal-product-image"
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
                {formData.imageUrl && formData.imageUrl.startsWith('https://') && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200">
                    <img
                      src={formData.imageUrl}
                      alt="Preview"
                      className="w-12 h-12 rounded-lg object-cover bg-white"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-[11px] text-slate-500 truncate flex-1">Image preview</span>
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description *
                </label>
                <textarea
                  id="modal-product-desc"
                  required
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Detailed therapeutic actions, ingredients, and dosage details..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 resize-none"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  id="modal-product-active"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600 border-slate-300"
                />
                <label htmlFor="modal-product-active" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Publish to Storefront (Active)
                </label>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  id="modal-product-save"
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving to Firestore...' : editingProduct ? 'Save Changes' : 'Create Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
