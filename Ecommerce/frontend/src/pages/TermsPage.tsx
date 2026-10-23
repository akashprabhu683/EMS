import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="font-display font-bold text-lg text-slate-900 mb-3">{title}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

export function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <SEO
        title="Terms of Service — Click & Collect Conditions"
        description="Review THANGAM STORES Terms of Service governing in-store Click & Collect reservations, counter payment in person, 6-digit pickup verification, and cancellations."
        canonical="https://ecommerce-storefront-client.vercel.app/terms"
      />
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Legal</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Terms of Service</h1>
          <p className="text-slate-500 text-xs mt-2">Last updated: October 2026</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <Section title="1. Click & Collect Reservations & Zero Online Payment">
            <p>By placing an order on THANGAM STORES (EMS Dispensary), you are reserving genuine herbal and Ayurvedic formulations for in-person physical collection at our store counter.</p>
            <p><strong>No Online Payment:</strong> No online payment is processed or accepted on this website. You settle the full order amount in person at our physical dispensary counter via Cash or UPI when you arrive to inspect and collect your items.</p>
          </Section>

          <Section title="2. Order Holding Window & Collection PIN Verification">
            <p>Reserved orders are held for a maximum of 48 hours following status confirmation. After this period, uncollected reservations may be cancelled automatically by dispensary staff and items returned to available inventory.</p>
            <p><strong>6-Digit Collection Verification PIN:</strong> Each confirmed order generates a unique, private 6-digit PIN visible on your Order Confirmation screen and Orders dashboard. You must present this verification PIN to counter staff upon collection to prevent unauthorized collection.</p>
          </Section>

          <Section title="3. Cancellation Policy">
            <p>Customers may cancel an order online directly from their Orders page while the order remains in <code>placed</code> status before dispensary preparation commences.</p>
            <p>Once preparation has begun or an order is marked <code>ready_for_pickup</code>, please contact or visit our dispensary counter if you need to adjust or withdraw your reservation.</p>
          </Section>

          <Section title="4. Product Authenticity & Pricing">
            <p>All herbal formulations, churnas, and botanical extracts are sourced directly from verified GMP-certified manufacturers and lab-standardized producers. Catalog prices and availability are updated regularly from our central dispensary database.</p>
          </Section>

          <Section title="5. Traditional Herbal Health Disclaimer">
            <p>Products offered on this platform are traditional herbal and Ayurvedic preparations. They are not intended to diagnose, treat, cure, or prevent any medical condition without professional clinical guidance. Please consult a qualified Ayurvedic physician or medical practitioner before beginning any new botanical regimen, particularly if you are pregnant, nursing, or taking prescription pharmaceuticals.</p>
          </Section>

          <Section title="6. Account Responsibility">
            <p>You are responsible for maintaining the confidentiality of your account credentials and your private 6-digit collection PIN. You agree to notify us immediately of any unauthorized access to your account.</p>
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
