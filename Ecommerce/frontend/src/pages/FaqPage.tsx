import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

const FAQS = [
  {
    category: 'Products & Quality',
    items: [
      { q: 'Are the products genuinely Ayurvedic?', a: 'Yes. Every product we stock is sourced from GMP-certified Ayurvedic manufacturers or verified wild-harvest cooperatives. Our in-house practitioner verifies each batch before it reaches the shelf.' },
      { q: 'Do your products contain artificial fillers or preservatives?', a: 'No. We specifically avoid products with synthetic binders, artificial colors, or preservatives. All items are botanically pure formulations.' },
      { q: 'Are your products lab-tested?', a: 'Yes. We stock products that have been third-party tested for heavy metals, adulteration, and active-constituent potency.' },
      { q: 'Can I ask for product advice?', a: 'Absolutely. Our counter staff are trained by Ayurvedic practitioners. When you collect, ask them any question about dosage, suitability, or combination with other medicines.' },
    ],
  },
  {
    category: 'Orders & Collection',
    items: [
      { q: 'Do I need to pay online?', a: 'No. EMS Dispensary uses a Click & Collect model — you reserve online and pay in person at the counter.' },
      { q: 'How long will my order be held?', a: 'Orders are held for 48 hours. After that, uncollected reservations are cancelled and items returned to stock.' },
      { q: 'Can I cancel my order?', a: 'Yes. Go to the Orders section in your account and cancel before you collect.' },
      { q: 'What payment methods do you accept at the counter?', a: 'We accept cash and UPI at the dispensary counter.' },
    ],
  },
  {
    category: 'Returns & Refunds',
    items: [
      { q: 'Can I return a product?', a: 'Sealed, unopened products may be returned within 7 days with proof of purchase from our counter.' },
      { q: 'What if a product is damaged?', a: 'Please inspect your medicines at the counter before leaving. Our staff will replace damaged or incorrect items immediately.' },
    ],
  },
];

export function FaqPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <SEO
        title="Frequently Asked Questions — Product Purity & Pickup"
        description="Get answers to common queries regarding Ayurvedic ingredient testing, unadulterated preparations, 48-hour order hold periods, and in-store counter payments."
        canonical="https://ecommerce-storefront-client.vercel.app/faq"
      />
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Help</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Product Quality FAQ</h1>
          <p className="text-slate-600 text-sm leading-relaxed mt-3 max-w-xl">
            Answers to the most common questions about our products, orders, and dispensary process.
          </p>
        </div>

        <div className="space-y-10">
          {FAQS.map(({ category, items }) => (
            <div key={category}>
              <h2 className="font-display font-bold text-lg text-slate-900 mb-4">{category}</h2>
              <div className="space-y-3">
                {items.map(({ q, a }) => (
                  <div key={q} className="bg-white border border-slate-200 rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{q}</p>
                        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{a}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex gap-3">
          <Link to="/products" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-sm">
            Browse Herbal Products
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
