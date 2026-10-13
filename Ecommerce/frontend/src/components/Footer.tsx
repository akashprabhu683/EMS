import { Link } from 'react-router-dom';
import { Globe, Camera, Users, Play, ArrowRight, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../context/ToastContext';

const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const toast = useToast();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.trim()) {
      setSubscribed(true);
      toast.success('Thank you! You are now subscribed to NovaShop updates.');
      setEmail('');
    }
  };

  const handleComingSoon = (e: React.MouseEvent, feature: string) => {
    e.preventDefault();
    toast.info(`${feature} is coming soon in the next release.`);
  };

  return (
    <footer className="relative bg-white border-t border-slate-200/90 mt-8 sm:mt-12">
      <div className="page-container pt-8 sm:pt-10 pb-12 sm:pb-16">

        {/* 1. Newsletter Banner with balanced padding & spacing */}
        <div className="bento-card bento-promo-cool p-6 sm:p-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 sm:gap-8 mb-12 sm:mb-16 shadow-xs border border-blue-200/70">
          <div className="max-w-xl text-child">
            <span className="badge-clean bg-blue-100 text-blue-700 text-xs font-bold mb-3">
              Member Perks
            </span>
            <h3 className="text-2xl sm:text-3xl font-display font-extrabold text-slate-900 tracking-tight mb-2">
              Stay ahead with curated drops
            </h3>
            <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
              Receive early access to seasonal releases, limited flash sales, and private member discounts delivered directly to your inbox.
            </p>
          </div>

          {subscribed ? (
            <div className="flex items-center gap-2.5 px-5 py-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-semibold shadow-2xs">
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
              <span>You're subscribed! Welcome to NovaShop.</span>
            </div>
          ) : (
            <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto shrink-0">
              <input
                id="newsletter-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email address"
                className="w-full sm:w-80 px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-xs sm:text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 shadow-2xs transition-all"
              />
              <button
                type="submit"
                id="newsletter-submit"
                className="btn-primary py-3 px-6 text-xs sm:text-sm rounded-xl shrink-0 shadow-xs"
              >
                <span>Subscribe</span>
                <ArrowRight size={15} />
              </button>
            </form>
          )}
        </div>

        {/* 2. Footer Navigation Columns */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12 mb-12 sm:mb-16">
          {/* Brand Column */}
          <div className="col-span-2 md:col-span-1 pr-4">
            <Link to="/" className="flex items-center gap-2.5 mb-4 group inline-flex">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-2xs group-hover:bg-blue-700 transition-colors">
                N
              </div>
              <span className="font-display font-bold text-xl text-slate-900 tracking-tight">
                Nova<span className="text-blue-600">Shop</span>
              </span>
            </Link>
            <p className="text-slate-500 text-xs sm:text-sm leading-relaxed mb-5">
              Carefully curated essentials for modern life. Transparent pricing, authentic products, and reliable global shipping.
            </p>
            <div className="flex gap-2.5">
              {[
                { Icon: Globe, name: 'NovaShop Global' },
                { Icon: Camera, name: 'Instagram community' },
                { Icon: Users, name: 'Customer community' },
                { Icon: Play, name: 'Video drops' },
              ].map(({ Icon, name }, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => handleComingSoon(e, name)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200/80 flex items-center justify-center transition-colors shadow-2xs focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label={name}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>

          {[
            {
              title: 'Categories',
              links: [
                { label: 'Electronics', to: '/products?category=electronics' },
                { label: 'Fashion & Apparel', to: '/products?category=fashion' },
                { label: 'Home & Living', to: '/products?category=home' },
                { label: 'Beauty & Wellness', to: '/products?category=beauty' },
                { label: 'Sports & Outdoors', to: '/products?category=sports' },
              ]
            },
            {
              title: 'Customer Service',
              links: [
                { label: 'Order Tracking', to: '/orders' },
                { label: 'Shipping & Delivery', to: '#' },
                { label: 'Returns & Exchanges', to: '#' },
                { label: 'Warranty & Care', to: '#' },
                { label: 'Help & FAQ', to: '#' },
              ]
            },
            {
              title: 'Company',
              links: [
                { label: 'Our Story', to: '#' },
                { label: 'Sustainability', to: '#' },
                { label: 'Careers', to: '#' },
                { label: 'Privacy Policy', to: '#' },
                { label: 'Terms of Service', to: '#' },
              ]
            },
          ].map(({ title, links }) => (
            <div key={title}>
              <h4 className="text-slate-900 font-bold text-xs uppercase tracking-wider mb-4">{title}</h4>
              <ul className="space-y-3">
                {links.map((link, idx) => (
                  <li key={idx}>
                    {link.to === '#' ? (
                      <button
                        type="button"
                        onClick={(e) => handleComingSoon(e, link.label)}
                        className="text-slate-500 hover:text-blue-600 text-xs sm:text-sm transition-colors text-left focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <Link
                        to={link.to}
                        className="text-slate-500 hover:text-blue-600 text-xs sm:text-sm transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 rounded"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 3. Bottom Legal & Trust Bar */}
        <div className="border-t border-slate-200 pt-6 sm:pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {CURRENT_YEAR} NovaShop Technologies Inc. All rights reserved.</p>
          <div className="flex items-center gap-2 text-slate-500">
            <ShieldCheck size={16} className="text-emerald-600" />
            <span>256-Bit SSL Encrypted &amp; PCI-DSS Compliant Demo</span>
          </div>
          <div className="flex gap-5">
            <button
              type="button"
              onClick={(e) => handleComingSoon(e, 'Privacy Policy')}
              className="hover:text-slate-900 transition-colors"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={(e) => handleComingSoon(e, 'Terms of Service')}
              className="hover:text-slate-900 transition-colors"
            >
              Terms of Service
            </button>
            <button
              type="button"
              onClick={(e) => handleComingSoon(e, 'Cookie Preferences')}
              className="hover:text-slate-900 transition-colors"
            >
              Cookie Preferences
            </button>
          </div>
        </div>

      </div>
    </footer>
  );
}

