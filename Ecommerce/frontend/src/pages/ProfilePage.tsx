import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import { useToast } from '../context/ToastContext';
import {
  User, Mail, Phone, MapPin, Heart, Package,
  Save, Leaf, Shield, Clock,
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export function ProfilePage() {
  const { user, isAuthenticated, isLoading: authLoading, updateProfile } = useAuth();
  const { favoritesCount } = useWishlist();
  const navigate = useNavigate();

  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [pickupCounter, setPickupCounter] = useState('Main Street Dispensary Counter (Health Complex)');
  const [herbalNotes, setHerbalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Load user data
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login?redirect=/profile');
      return;
    }

    if (user) {
      setFullName(user.name || '');
      setPhone(user.phone || '');

      // Load extended dispensary profile from Firestore
      const userRef = doc(db, 'users', user.id);
      getDoc(userRef).then(snap => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.phone && !phone) setPhone(data.phone);
          if (data.pickupCounter) setPickupCounter(data.pickupCounter);
          if (data.herbalNotes) setHerbalNotes(data.herbalNotes);
        }
      }).catch(console.warn);
    }
  }, [user, isAuthenticated, authLoading, navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.warning('Full name cannot be empty.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        name: fullName.trim(),
        phone: phone.trim(),
      });

      if (user?.id) {
        const userRef = doc(db, 'users', user.id);
        await setDoc(userRef, {
          displayName: fullName.trim(),
          phone: phone.trim(),
          pickupCounter,
          herbalNotes: herbalNotes.trim(),
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      toast.success('Profile details updated successfully!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-12">
      <div className="page-container pt-8 sm:pt-10 max-w-4xl mx-auto">

        {/* Page Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
              <Leaf size={13} /> Account Center
            </span>
            <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900 mt-1 tracking-tight">
              My Dispensary Profile
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Manage your contact details, pickup dispensary preferences, and herbal care notes.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/orders"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <Package size={14} className="text-emerald-700" />
              <span>My Orders</span>
            </Link>
            <Link
              to="/favorites"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 transition-colors shadow-2xs"
            >
              <Heart size={14} />
              <span>Saved ({favoritesCount})</span>
            </Link>
          </div>
        </div>


        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* User Card */}
          <div className="md:col-span-1 space-y-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 text-center shadow-xs">
              <div className="w-20 h-20 rounded-full mx-auto mb-4 border-2 border-emerald-200 p-0.5 overflow-hidden shadow-2xs">
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover rounded-full" />
                ) : (
                  <div className="w-full h-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xl">
                    {user?.name?.[0] || 'U'}
                  </div>
                )}
              </div>
              <h2 className="font-display font-bold text-lg text-slate-900">{user?.name}</h2>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold">
                <Shield size={11} /> Verified Customer
              </div>
            </div>

            {/* Quick Dispensary Info */}
            <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-3xl p-5 text-xs text-slate-700 space-y-3 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <Clock size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900">Click &amp; Collect Service</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Orders are prepared within 2-4 hours during counter hours.</p>
                </div>
              </div>
              <div className="flex items-start gap-2.5 pt-2 border-t border-emerald-100">
                <MapPin size={16} className="text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-900">Counter Hours</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Mon–Sat · 9:00 AM – 7:00 PM</p>
                </div>
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <div className="md:col-span-2">
            <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-5">
              <h3 className="font-display font-bold text-base text-slate-900 pb-2 border-b border-slate-100">
                Personal &amp; Pickup Details
              </h3>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors"
                  />
                </div>
              </div>

              {/* Email (Read only) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 cursor-not-allowed"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Managed via your Google sign-in account.</p>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Phone Number for Pickup SMS / Calls
                </label>
                <div className="relative">
                  <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Used by dispensary staff when your medicine is ready for collection.</p>
              </div>

              {/* Preferred Dispensary Counter */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Preferred Collection Counter
                </label>
                <div className="relative">
                  <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={pickupCounter}
                    onChange={e => setPickupCounter(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors bg-white"
                  >
                    <option value="Main Street Dispensary Counter (Health Complex)">
                      Main Street Dispensary Counter (Health Complex)
                    </option>
                    <option value="Downtown Botanical Branch — Counter 1">
                      Downtown Botanical Branch — Counter 1
                    </option>
                    <option value="City Center Ayurvedic Clinic & Dispensary">
                      City Center Ayurvedic Clinic & Dispensary
                    </option>
                  </select>
                </div>
              </div>

              {/* Herbal & Allergy Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Dietary &amp; Herbal Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={herbalNotes}
                  onChange={e => setHerbalNotes(e.target.value)}
                  placeholder="e.g. Prefer sugar-free formulations, vegetarian capsules, allergic to ginger powder..."
                  className="w-full p-3.5 rounded-xl border border-slate-200 text-sm text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-colors resize-none"
                />
              </div>

              {/* Save Button */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-emerald-300 text-white text-sm font-bold transition-colors shadow-2xs cursor-pointer"
                >
                  <Save size={15} />
                  <span>{saving ? 'Saving Changes...' : 'Save Profile Details'}</span>
                </button>
              </div>
            </form>
          </div>

        </div>

      </div>
    </main>
  );
}
