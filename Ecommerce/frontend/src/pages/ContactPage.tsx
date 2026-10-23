import { MapPin, Clock, Phone, Mail, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { SEO } from '../components/SEO';

export function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [sent, setSent] = useState(false);
  const toast = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.warning('Please fill in all contact form fields.');
      return;
    }
    setSent(true);
    toast.success('Your message has been noted. We\'ll get back to you shortly.');
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <SEO
        title="Contact Dispensary Counter"
        description="Get in touch with THANGAM STORES dispensary counter. Find our store address, opening hours (Mon-Sat 9AM-7PM), and customer support."
        canonical="https://ecommerce-storefront-client.vercel.app/contact"
      />
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Get in touch</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Contact Dispensary</h1>
          <p className="text-slate-600 text-sm leading-relaxed mt-3 max-w-xl">
            Have a question about a product, an order, or our herbal remedies? Reach out below or visit us directly.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-10">
          {/* Dispensary info */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/60 border border-emerald-200/80 rounded-2xl p-6 space-y-4">
            <h2 className="font-display font-bold text-base text-slate-900">Dispensary details</h2>
            <div className="space-y-3 text-sm text-slate-700">
              <div className="flex items-start gap-3">
                <MapPin size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Main Street Dispensary Counter</span>
              </div>
              <div className="flex items-start gap-3">
                <Clock size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Mon – Sat: 9:00 AM – 7:00 PM<br />Sunday: Closed</span>
              </div>
              <div className="flex items-start gap-3">
                <Phone size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>Available at counter during open hours</span>
              </div>
              <div className="flex items-start gap-3">
                <Mail size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>enquiries@emsdispensary.in</span>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h2 className="font-display font-bold text-base text-slate-900 mb-4 flex items-center gap-2">
              <MessageSquare size={16} className="text-emerald-600" /> Send a message
            </h2>
            {sent ? (
              <div className="text-sm text-emerald-700 font-semibold bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                Message received — we'll reply within 1 business day.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                />
                <textarea
                  required
                  placeholder="Your message or query"
                  rows={4}
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all resize-none"
                />
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  Send Message
                </button>
              </form>
            )}
          </div>
        </div>

        <Link to="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
