import { Link } from 'react-router-dom';
import { ShieldAlert, LayoutDashboard, ClipboardList } from 'lucide-react';
import { useEffect } from 'react';

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page Not Found — EMS Dispensary Admin';
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800/80 border border-slate-700/80 rounded-2xl p-6 sm:p-8 text-center shadow-xl">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5">
          <ShieldAlert size={32} />
        </div>

        <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">
          Admin Portal 404
        </span>

        <h1 className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1">
          Page Not Found
        </h1>

        <p className="text-slate-400 text-xs sm:text-sm mt-3 leading-relaxed">
          The requested administrative view does not exist or has been relocated.
        </p>

        <div className="mt-6 space-y-3">
          <Link
            to="/"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold transition-colors"
          >
            <LayoutDashboard size={16} />
            <span>Go to Admin Dashboard</span>
          </Link>

          <Link
            to="/orders"
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs sm:text-sm font-semibold transition-colors"
          >
            <ClipboardList size={16} />
            <span>View Orders Queue</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
