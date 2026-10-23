import { Link } from 'react-router-dom';
import { SEO } from '../components/SEO';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="font-display font-bold text-lg text-slate-900 mb-3">{title}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

export function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <SEO
        title="Privacy Policy — Data Protection & Consent"
        description="Read how THANGAM STORES protects customer data, user authentication via Firebase, order details, and privacy-respecting practices."
        canonical="https://ecommerce-storefront-client.vercel.app/privacy"
      />
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Legal</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 text-xs mt-2">Last updated: October 2026</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <Section title="1. Information We Collect">
            <p>When you sign in using Google Authentication or create an account, we receive your name, email address, and profile avatar to maintain your authenticated customer account.</p>
            <p>When placing Click &amp; Collect orders, we record the recipient pickup name and contact phone number. We generate a private 6-digit collection verification PIN to safeguard counter order pickups.</p>
            <p><strong>Zero Online Payment Data:</strong> We do NOT collect credit card numbers, debit card details, CVVs, or online banking credentials. All payments occur in person at our physical dispensary counter via Cash or UPI.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>Your details are used solely to fulfill Click &amp; Collect orders, update you on preparation status, and prevent duplicate order submissions.</p>
            <p>We do not sell, rent, monetize, or trade your personal data with third-party advertisers or data brokers under any circumstances.</p>
          </Section>

          <Section title="3. Data Infrastructure & Security">
            <p>Customer account records and order logs are stored on Google Cloud Firebase (Cloud Firestore &amp; Firebase Authentication) infrastructure with granular role-based security rules.</p>
            <p>Only verified dispensary administrators and staff can access order queues for preparation and collection verification.</p>
          </Section>

          <Section title="4. Cookies & Local Storage">
            <p>We use essential browser local storage and session tokens to maintain your login session and preserve items in your shopping bag.</p>
            <p>Optional, privacy-preserving analytics may be enabled solely to understand catalog popularity and improve dispensary operations. No personally identifiable information (PII), passwords, or 6-digit pickup PINs are ever sent to analytics.</p>
          </Section>

          <Section title="5. Your Rights & Data Access">
            <p>You have the right to inspect your order history at any time through the Orders section. You may also request deletion of your account and personal details by contacting our dispensary counter or sending an email request.</p>
          </Section>

          <Section title="6. Contact Information">
            <p>For any privacy questions or data requests, contact us at <strong>enquiries@emsdispensary.in</strong> or visit the THANGAM STORES Main Street Dispensary Counter during working hours (Mon–Sat: 9:00 AM – 7:00 PM).</p>
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
