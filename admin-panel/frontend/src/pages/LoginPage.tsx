import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isAdmin } = useAdminAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Please provide both email address and password.');
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      await login(email.trim(), password);
      // ProtectedRoute will route to dashboard or access-denied depending on admin claim
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      let msg = 'Failed to sign in. Please verify your credentials.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        msg = 'Invalid email or password.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Too many failed login attempts. Please try again later.';
      }
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-xl space-y-6">
        
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mx-auto shadow-md">
            <ShieldCheck size={26} />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display">
              EMS Dispensary Admin
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Sign in with your administrator credentials
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
            <AlertCircle size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail size={16} />
              </div>
              <input
                id="admin-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Password
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock size={16} />
              </div>
              <input
                id="admin-password-input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 outline-none transition-all"
              />
            </div>
          </div>

          <button
            id="admin-login-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-700 hover:bg-emerald-800 text-white flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-50 mt-2"
          >
            <span>{isSubmitting ? 'Authenticating...' : 'Sign In as Administrator'}</span>
            {!isSubmitting && <ArrowRight size={15} />}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Protected system. Admin custom claim required for access.
          </p>
        </div>

      </div>
    </div>
  );
}
