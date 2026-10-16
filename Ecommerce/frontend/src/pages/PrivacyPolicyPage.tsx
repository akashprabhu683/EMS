import { Link } from 'react-router-dom';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mb-8">
    <h2 className="font-display font-bold text-lg text-slate-900 mb-3">{title}</h2>
    <div className="text-sm text-slate-600 leading-relaxed space-y-3">{children}</div>
  </div>
);

export function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-8">
      <div className="page-container pt-10 pb-16 max-w-3xl mx-auto">
        <div className="mb-10">
          <span className="text-xs font-bold text-emerald-700 tracking-wider uppercase">Legal</span>
          <h1 className="font-display font-extrabold text-3xl sm:text-4xl text-slate-900 mt-1 tracking-tight">Privacy Policy</h1>
          <p className="text-slate-500 text-xs mt-2">Last updated: October 2026</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
          <Section title="Information we collect">
            <p>When you sign in with Google, we receive your name, email address, and profile photo to identify your account. We also store orders you place so you can track them.</p>
            <p>We do not collect payment information — all payments happen in person at our dispensary counter.</p>
          </Section>

          <Section title="How we use your information">
            <p>Your information is used solely to manage your Click &amp; Collect orders and communicate dispensary updates if you subscribe to our newsletter.</p>
            <p>We do not sell, rent, or share your personal data with third parties for marketing purposes.</p>
          </Section>

          <Section title="Data storage">
            <p>Your data is stored securely on Google Firebase (Cloud Firestore) infrastructure, which is compliant with industry-standard security practices.</p>
          </Section>

          <Section title="Cookies">
            <p>We use Firebase Authentication session cookies to keep you signed in. No advertising or tracking cookies are used.</p>
          </Section>

          <Section title="Your rights">
            <p>You may request deletion of your account data at any time by contacting us at our dispensary counter or via email.</p>
          </Section>

          <Section title="Contact">
            <p>For any privacy-related concerns, visit us at the Main Street Dispensary Counter or reach out through our contact page.</p>
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
