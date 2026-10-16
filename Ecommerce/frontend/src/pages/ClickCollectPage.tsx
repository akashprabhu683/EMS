import { MapPin, Clock, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ClickCollectPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">How it works</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Click &amp; Collect</h1>
          <p className="text-slate-600 text-sm leading-relaxed mt-3 max-w-xl">
            Reserve your herbal medicines online. Pay nothing upfront. Collect and pay in person at our dispensary counter — it's that simple.
          </p>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          {[
            { step: '1', title: 'Browse & Reserve', desc: 'Add products to your cart. Sign in with Google and confirm your pickup name and phone number.' },
            { step: '2', title: 'We Prepare', desc: 'Your order is sent to our dispensary team. We set aside your items so they\'re ready when you arrive.' },
            { step: '3', title: 'Collect & Pay', desc: 'Visit our counter. Inspect your medicines, ask our staff any questions, then pay by cash or UPI.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center font-display font-extrabold text-emerald-800">
                {step}
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <h2 className="font-display font-bold text-xl text-slate-900 mb-4">Common questions</h2>
        <div className="space-y-3 mb-10">
          {[
            { q: 'Do I pay anything online?', a: 'No. There is zero online payment. All payments happen in person at our counter when you collect your order.' },
            { q: 'How long is my order held?', a: 'We hold reserved orders for up to 48 hours. After that, uncollected orders may be cancelled and returned to stock.' },
            { q: 'Can I cancel my order?', a: 'Yes. You can cancel any time before collection from the Orders section in your account.' },
            { q: 'Can I modify my order after placing?', a: 'Not online — but speak to our counter staff when you arrive and we will accommodate changes if stock is available.' },
            { q: 'Do I need the app or account to collect?', a: 'Yes, you need to sign in so we can match your order. Just show the order confirmation screen at the counter.' },
          ].map(({ q, a }) => (
            <div key={q} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-slate-900">{q}</p>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Location */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-2xl p-6 mb-8">
          <h2 className="font-display font-bold text-lg text-slate-900 mb-4">Dispensary counter details</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Main Street Dispensary Counter — cash &amp; UPI accepted</span>
            </div>
            <div className="flex items-start gap-3">
              <Clock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Monday – Saturday: 9:00 AM – 7:00 PM &nbsp;|&nbsp; Sunday: Closed</span>
            </div>
            <div className="flex items-start gap-3">
              <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>All products are sealed, lab-verified, and ready for inspection at pickup</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <Link to="/products" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-sm">
            Browse Herbal Products
          </Link>
          <Link to="/orders" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors">
            My Orders
          </Link>
        </div>
      </div>
    </main>
  );
}
