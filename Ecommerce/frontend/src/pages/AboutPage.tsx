import { Leaf, ShieldCheck, MapPin, Clock, FlaskConical, Heart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function AboutPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">About Us</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">
            Our Story
          </h1>
          <p className="text-slate-600 text-sm leading-relaxed mt-3 max-w-xl">
            EMS Herbal Dispensary was founded with one simple belief — that authentic, time-honored herbal medicine belongs within every household's reach.
          </p>
        </div>

        {/* Story */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 mb-8 space-y-4 text-sm text-slate-700 leading-relaxed">
          <p>
            We are a family-run Ayurvedic dispensary that has been serving our community for over a decade. Our roots are in classical Ayurvedic practice — studying traditional texts, sourcing herbs responsibly, and working closely with reputed botanical manufacturers who share our values.
          </p>
          <p>
            Every product we carry is hand-selected by our in-house practitioner team. We refuse shortcuts: no synthetic fillers, no mass-market dilution, and no compromise on botanical authenticity. From raw Ashwagandha root to the 51-herb Chyawanprash formulation — each item on our shelf has been earned its place.
          </p>
          <p>
            Our Click &amp; Collect model was built around the trust of physical dispensary interaction. We believe you should be able to inspect, ask questions, and pay only when you're satisfied — in person, at our counter.
          </p>
        </div>

        {/* Values */}
        <h2 className="font-display font-bold text-xl text-slate-900 mb-4">What we stand for</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          {[
            { icon: Leaf, title: 'Pure Botanical Sourcing', desc: 'We source directly from GMP-certified Ayurvedic manufacturers and wild-harvest cooperatives.' },
            { icon: ShieldCheck, title: 'Dispensary Verified', desc: 'Every batch is checked by our in-house Ayurvedic practitioner before it reaches the shelf.' },
            { icon: FlaskConical, title: 'Lab Standardized', desc: 'Third-party tested for heavy metals, adulteration, and active constituent potency.' },
            { icon: Heart, title: 'Patient-First Philosophy', desc: 'Our counter staff are trained to guide, not just sell. We\'ll always recommend what\'s right for you.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="bg-white border border-slate-200 rounded-2xl p-5 flex gap-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                <Icon size={18} className="text-emerald-700" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900">{title}</h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Location */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-2xl p-6 sm:p-8 mb-8">
          <h2 className="font-display font-bold text-lg text-slate-900 mb-4">Visit us</h2>
          <div className="space-y-3 text-sm text-slate-700">
            <div className="flex items-start gap-3">
              <MapPin size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Main Street Dispensary Counter — in-person collection &amp; pay at counter</span>
            </div>
            <div className="flex items-start gap-3">
              <Clock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <span>Monday – Saturday: 9:00 AM – 7:00 PM &nbsp;|&nbsp; Sunday: Closed</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
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
