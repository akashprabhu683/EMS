import { Link } from 'react-router-dom';
import { Leaf, Search, Home, MapPin, ArrowRight } from 'lucide-react';
import { SEO } from '../components/SEO';

export function NotFoundPage() {
  return (
    <main className="min-h-[75vh] bg-slate-50 flex items-center justify-center px-4 py-16 sm:py-24 text-slate-900">
      <SEO
        title="Page Not Found (404)"
        description="The page you are looking for does not exist or has been moved. Explore our authentic herbal and Ayurvedic formulations."
        noindex={true}
      />

      <div className="max-w-md w-full text-center">
        {/* Graphic badge */}
        <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-800 shadow-sm mb-6">
          <Leaf size={36} className="rotate-12" />
        </div>

        <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">
          Error 404
        </span>

        <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-2 tracking-tight">
          Remedy Not Found
        </h1>

        <p className="text-slate-600 text-xs sm:text-sm mt-3 leading-relaxed">
          The page or formulation you are looking for cannot be located. It may have been relocated or updated in our dispensary catalog.
        </p>

        {/* Action cards / buttons */}
        <div className="mt-8 space-y-3">
          <Link
            to="/products"
            id="404-browse-products-btn"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-semibold transition-colors shadow-sm"
          >
            <Search size={16} />
            <span>Browse Available Catalog</span>
            <ArrowRight size={14} />
          </Link>

          <Link
            to="/"
            id="404-home-btn"
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-semibold transition-colors shadow-2xs"
          >
            <Home size={16} />
            <span>Return to Homepage</span>
          </Link>
        </div>

        {/* Helpful links strip */}
        <div className="mt-8 pt-6 border-t border-slate-200/80 flex items-center justify-center gap-4 text-xs font-semibold text-emerald-700">
          <Link to="/click-collect" className="hover:text-emerald-800 underline underline-offset-2">
            Click &amp; Collect Guide
          </Link>
          <span className="text-slate-300">•</span>
          <Link to="/contact" className="hover:text-emerald-800 underline underline-offset-2">
            Contact Counter
          </Link>
          <span className="text-slate-300">•</span>
          <Link to="/faq" className="hover:text-emerald-800 underline underline-offset-2">
            FAQ
          </Link>
        </div>
      </div>
    </main>
  );
}
