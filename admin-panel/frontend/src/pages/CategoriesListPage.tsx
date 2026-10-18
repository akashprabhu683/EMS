import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  Edit2,
  Power,
  X,
  AlertCircle,
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import {
  getAllCategories,
  createCategory,
  updateCategory,
  setCategoryActiveStatus,
  generateSlug,
  isCategoryReferencedByProducts,
} from '../services/adminCategoryService';
import { ConfirmationModal } from '../components/ConfirmationModal';
import type { Category, CategoryFormData } from '../types';

export function CategoriesListPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form State
  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    slug: '',
    description: '',
    isActive: true,
  });

  // Deactivation confirmation modal
  const [deactivateCategory, setDeactivateCategory] = useState<Category | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [deactivateWarning, setDeactivateWarning] = useState<string>('');

  const loadData = async () => {
    setLoading(true);
    try {
      const list = await getAllCategories();
      setCategories(list);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredCategories = useMemo(() => {
    return categories.filter((c) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch = c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'all'
          ? true
          : statusFilter === 'active'
          ? c.isActive
          : !c.isActive;
      return matchesSearch && matchesStatus;
    });
  }, [categories, searchQuery, statusFilter]);

  const handleOpenCreateModal = () => {
    setEditingCategory(null);
    setModalError(null);
    setFormData({
      name: '',
      slug: '',
      description: '',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (cat: Category) => {
    setEditingCategory(cat);
    setModalError(null);
    setFormData({
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      isActive: cat.isActive,
    });
    setIsModalOpen(true);
  };

  const handleNameChange = (name: string) => {
    if (!editingCategory) {
      // Auto-generate slug when creating new category
      setFormData((prev) => ({
        ...prev,
        name,
        slug: generateSlug(name),
      }));
    } else {
      setFormData((prev) => ({ ...prev, name }));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    setIsSaving(true);

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, formData);
        toast.success(`Category "${formData.name}" successfully updated.`);
      } else {
        await createCategory(formData);
        toast.success(`Category "${formData.name}" successfully created.`);
      }
      setIsModalOpen(false);
      await loadData();
    } catch (err: any) {
      setModalError(err.message || 'Failed to save category.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleActiveClick = async (cat: Category) => {
    if (cat.isActive) {
      // Check if referenced by products to customize warning
      const isReferenced = await isCategoryReferencedByProducts(cat.id);
      let warning = `Are you sure you want to deactivate "${cat.name}"?`;
      if (isReferenced) {
        warning += ' Note: This category is currently referenced by products in your catalog. Deactivating it will hide it from category listings, but will not delete referenced products.';
      }
      setDeactivateWarning(warning);
      setDeactivateCategory(cat);
    } else {
      executeStatusChange(cat, true);
    }
  };

  const executeStatusChange = async (cat: Category, newStatus: boolean) => {
    try {
      await setCategoryActiveStatus(cat.id, newStatus);
      toast.success(`Category "${cat.name}" has been ${newStatus ? 'activated' : 'deactivated'}.`);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update category status.');
    } finally {
      setDeactivateCategory(null);
      setIsDeactivating(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!deactivateCategory) return;
    setIsDeactivating(true);
    await executeStatusChange(deactivateCategory, false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
            Category Management
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Define taxonomies with unique slugs and manage category availability
          </p>
        </div>

        <button
          id="btn-create-category"
          onClick={handleOpenCreateModal}
          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow-2xs transition-colors self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>New Category</span>
        </button>
      </div>


      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <Search size={16} />
          </div>
          <input
            id="category-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search categories by name or slug..."
            className="w-full pl-10 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Status:</span>
          <select
            id="category-status-filter"
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-700 outline-none focus:border-emerald-600"
          >
            <option value="all">All Categories</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-emerald-700 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold text-slate-500">Loading categories from Firestore...</p>
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Layers size={24} />
            </div>
            <h3 className="text-sm font-bold text-slate-800">No categories found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {categories.length === 0
                ? 'Your Firestore database currently has no categories. Click "New Category" above to create one.'
                : 'No categories match your search criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Category Name</th>
                  <th className="py-3 px-4">Slug Identifier</th>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredCategories.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    {/* Name */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {c.name}
                      <span className="font-mono text-[10px] text-slate-400 font-normal block">
                        ID: {c.id}
                      </span>
                    </td>

                    {/* Slug */}
                    <td className="py-3.5 px-4">
                      <code className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-emerald-800 font-mono text-xs">
                        {c.slug}
                      </code>
                    </td>

                    {/* Description */}
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {c.description || '—'}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          c.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            c.isActive ? 'bg-emerald-500' : 'bg-slate-400'
                          }`}
                        />
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditModal(c)}
                          className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="Edit category"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleToggleActiveClick(c)}
                          className={`p-1.5 rounded-lg transition-colors ${
                            c.isActive
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={c.isActive ? 'Deactivate category' : 'Activate category'}
                        >
                          <Power size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={Boolean(deactivateCategory)}
        title="Deactivate Category"
        message={deactivateWarning}
        confirmLabel="Deactivate"
        confirmVariant="warning"
        isLoading={isDeactivating}
        onConfirm={handleConfirmDeactivate}
        onCancel={() => setDeactivateCategory(null)}
      />

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-xl border border-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900 font-display">
                  {editingCategory ? 'Edit Category' : 'Create New Category'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stored in Firestore <code className="font-mono text-emerald-700">categories</code> collection
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
              {/* Category Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Category Name *
                </label>
                <input
                  id="modal-category-name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g. Herbal Extracts"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                />
              </div>

              {/* Slug Identifier */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Slug Identifier * (must be unique)
                </label>
                <input
                  id="modal-category-slug"
                  type="text"
                  required
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().trim() })}
                  placeholder="e.g. herbal-extracts"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 font-mono"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Lowercase alphanumeric and hyphens only. Used for routing and URLs.
                </span>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description (Optional)
                </label>
                <textarea
                  id="modal-category-desc"
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of this collection..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 outline-none focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 resize-none"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  id="modal-category-active"
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 rounded text-emerald-700 focus:ring-emerald-600 border-slate-300"
                />
                <label htmlFor="modal-category-active" className="text-xs font-bold text-slate-700 cursor-pointer">
                  Active (Available in storefront)
                </label>
              </div>

              {/* Buttons */}
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
                  id="modal-category-save"
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : editingCategory ? 'Save Changes' : 'Create Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
