import { Link } from 'react-router-dom';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="font-display font-bold text-lg text-slate-900 mb-3">{title}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

export function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Legal</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Terms of Service</h1>
          <p className="text-slate-500 text-xs mt-2">Last updated: October 2026</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <Section title="Click & Collect orders">
            <p>By placing an order on EMS Dispensary, you are reserving products for in-person collection. No payment is taken online — you pay at the counter when you collect.</p>
            <p>Reserved orders are held for up to 48 hours. After this period, uncollected orders may be cancelled and products returned to stock.</p>
          </Section>

          <Section title="Product information">
            <p>Product descriptions, pricing, and availability are updated regularly but may change without prior notice. Final pricing is confirmed at the dispensary counter.</p>
          </Section>

          <Section title="Returns & cancellations">
            <p>You may cancel your order at any time before collection by visiting the Orders section of your account.</p>
            <p>Collected products may be returned within 7 days if they are sealed, unused, and accompanied by proof of purchase from our counter.</p>
          </Section>

          <Section title="Health disclaimer">
            <p>The products on this platform are traditional herbal preparations and are not intended to diagnose, treat, cure, or prevent any disease. Please consult a qualified healthcare professional before use if you have a medical condition or are on prescription medication.</p>
          </Section>

          <Section title="Account responsibility">
            <p>You are responsible for maintaining the confidentiality of your account. Orders placed through your account are your responsibility.</p>
          </Section>

          <Section title="Changes to terms">
            <p>We may update these terms at any time. Continued use of the platform constitutes acceptance of the updated terms.</p>
          </Section>
        </div>

        <div className="mt-6">
          <Link to="/" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-colors">
            Back to Home
          </Link>
        </div>
      </div>
    </main>
  );
}
