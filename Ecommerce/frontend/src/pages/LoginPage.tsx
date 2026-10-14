import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { User, Lock, Mail, Eye, EyeOff, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

interface LoginPageProps {
  initialMode?: 'login' | 'register';
}

export function LoginPage({ initialMode }: LoginPageProps) {
  const { login, register, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'login' | 'register'>(() => {
    if (initialMode) return initialMode;
    return location.pathname === '/register' ? 'register' : 'login';
  });

  useEffect(() => {
    if (location.pathname === '/register') {
      setMode('register');
    } else if (location.pathname === '/login') {
      setMode('login');
    }
  }, [location.pathname]);

  const [showPass, setShowPass] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'register' && form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    try {
      if (mode === 'login') await login(form.email, form.password);
      else                  await register(form.name, form.email, form.password);
      navigate('/');
    } catch {
      setError('Invalid credentials. Please verify your email and password.');
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 flex items-center justify-center px-4 pt-16 pb-16">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xs space-y-6">
          {/* Logo */}
          <div className="text-center space-y-1">
            <Link to="/" className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                N
              </div>
              <span className="font-display font-bold text-xl text-slate-900">
                Nova<span className="text-blue-600">Shop</span>
              </span>
            </Link>
            <h1 className="font-display font-extrabold text-2xl text-slate-900">
              {mode === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h1>
            <p className="text-xs text-slate-500">
              {mode === 'login' ? 'Sign in to access your orders and saved wishlist' : 'Join thousands of members enjoying exclusive seasonal discounts'}
            </p>
          </div>

          {/* Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              id="login-tab-btn"
              onClick={() => { setMode('login'); setError(''); }}
              className={clsx(
                'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                mode === 'login' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Sign In
            </button>
            <button
              id="register-tab-btn"
              onClick={() => { setMode('register'); setError(''); }}
              className={clsx(
                'flex-1 py-2 rounded-lg text-xs font-bold transition-all',
                mode === 'register' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
              )}
            >
              Register
            </button>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                  Full Name
                </label>
                <div className="relative">
                  <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="register-name"
                    type="text"
                    required
                    value={form.name}
                    onChange={set('name')}
                    placeholder="Marcus Vance"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                Email Address
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-email"
                  type="email"
                  required
                  value={form.email}
                  onChange={set('email')}
                  placeholder="name@example.com"
                  className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                Password
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={set('password')}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-slate-700 text-xs font-bold uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    id="register-confirm"
                    type="password"
                    required
                    value={form.confirm}
                    onChange={set('confirm')}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>
            )}

            <button
              id="login-submit-btn"
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-3 text-sm rounded-xl justify-center shadow-2xs mt-2"
            >
              <span>{isLoading ? 'Processing…' : mode === 'login' ? 'Sign In to Account' : 'Create Free Account'}</span>
              <ArrowRight size={15} />
            </button>
          </form>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck size={13} className="text-emerald-600" />
            <span>End-to-end encrypted session</span>
          </div>
        </div>
      </div>
    </main>
  );
}
