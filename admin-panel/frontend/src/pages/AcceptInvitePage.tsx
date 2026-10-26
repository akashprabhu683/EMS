import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, CheckCircle2, Loader2, ArrowRight, Crown, Sparkles, Shield } from 'lucide-react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth } from '../firebase';
import { verifyInvitation, acceptInvitation } from '../services/adminRoleService';
import { useAdminAuth } from '../context/AdminAuthContext';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshClaims } = useAdminAuth();

  const token = searchParams.get('token') || '';
  const emailParam = searchParams.get('email') || '';

  const [canonicalEmail, setCanonicalEmail] = useState<string>(emailParam);
  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [invitedRole, setInvitedRole] = useState<'superadmin' | 'admin'>('admin');
  const [invitedBy, setInvitedBy] = useState<string>('EMS Administrator');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);

  useEffect(() => {
    document.title = 'Accept Admin Invitation — EMS Dispensary Admin';
    async function checkToken() {
      if (!token) {
        setErrorMsg('Invalid or incomplete invitation link. Missing token parameter.');
        setIsLoading(false);
        return;
      }

      try {
        const res = await verifyInvitation(token, emailParam || undefined);
        if (res.valid) {
          setIsValid(true);
          if (res.email) setCanonicalEmail(res.email);
          if (res.invitedBy) setInvitedBy(res.invitedBy);
          if (res.role) setInvitedRole(res.role);
        } else {
          setErrorMsg(res.reason || 'This invitation is invalid, has expired, or was already accepted.');
        }
      } catch (err: any) {
        setErrorMsg(err.message || 'Failed to verify invitation. Please check your network connection.');
      } finally {
        setIsLoading(false);
      }
    }

    checkToken();
  }, [token, emailParam]);

  const handleAcceptWithGoogle = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const targetEmail = (canonicalEmail || emailParam).trim().toLowerCase();

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        login_hint: targetEmail,
        prompt: 'select_account',
      });

      const cred = await signInWithPopup(auth, provider);
      const loggedEmail = cred.user.email?.toLowerCase().trim();

      if (targetEmail && loggedEmail !== targetEmail) {
        setErrorMsg(
          `You signed in with ${loggedEmail}, but this invitation was issued to ${targetEmail}. Please sign in with ${targetEmail}.`
        );
        setIsSubmitting(false);
        return;
      }

      // Call backend to accept token and grant claims
      await acceptInvitation(token);

      // Refresh claims so the portal recognizes the new role immediately
      await refreshClaims();

      setAcceptedSuccess(true);
      setTimeout(() => {
        window.location.href = '/';
      }, 1200);
    } catch (err: any) {
      console.error('Accept invitation error:', err);
      let msg = 'Failed to accept invitation. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completing.';
      } else if (err.code === 'auth/popup-blocked') {
        msg = 'Sign-in popup was blocked. Please allow popups or use Google sign-in inside the app.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  const isSuper = invitedRole === 'superadmin';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div
            className={`w-14 h-14 rounded-2xl text-white flex items-center justify-center mx-auto shadow-md transition-all ${
              isSuper ? 'bg-purple-700 shadow-purple-500/20' : 'bg-emerald-700 shadow-emerald-500/20'
            }`}
          >
            {isSuper ? <Crown size={30} /> : <ShieldCheck size={30} />}
          </div>
          <div>
            <span
              className={`text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full border ${
                isSuper
                  ? 'text-purple-700 bg-purple-50 border-purple-200'
                  : 'text-emerald-700 bg-emerald-50 border-emerald-200'
              }`}
            >
              {isSuper ? 'Superadministrator Access' : 'Dispensary Administrator'}
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display mt-2">
              {isSuper ? 'Accept Superadmin Role' : 'Administrator Invitation'}
            </h1>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 size={32} className={`animate-spin ${isSuper ? 'text-purple-600' : 'text-emerald-600'}`} />
            <p className="text-sm font-medium">Validating invitation credentials...</p>
          </div>
        )}

        {/* Error / Invalid State */}
        {!isLoading && !isValid && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs sm:text-sm flex items-start gap-3">
              <AlertCircle size={20} className="flex-shrink-0 text-rose-600 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-900">Unable to accept invitation</p>
                <p className="mt-1 text-rose-700">{errorMsg}</p>
              </div>
            </div>
            <Link
              to="/login"
              className="w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              Go to Admin Login
            </Link>
          </div>
        )}

        {/* Success Transition */}
        {acceptedSuccess && (
          <div
            className={`p-5 rounded-2xl border text-center space-y-2 ${
              isSuper ? 'bg-purple-50 border-purple-200 text-purple-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
            }`}
          >
            <CheckCircle2 size={36} className={`mx-auto ${isSuper ? 'text-purple-600' : 'text-emerald-600'}`} />
            <h3 className="font-bold text-base">
              {isSuper ? 'Superadmin Privileges Activated!' : 'Administrator Privileges Activated!'}
            </h3>
            <p className="text-xs text-slate-600">
              Your credentials are active. Entering dispensary management console...
            </p>
          </div>
        )}

        {/* Valid State: Prompt to Accept */}
        {!isLoading && isValid && !acceptedSuccess && (
          <div className="space-y-5">
            <div className={`p-4 rounded-2xl border text-xs space-y-2.5 ${isSuper ? 'bg-purple-50/50 border-purple-200/80' : 'bg-slate-50 border-slate-200'}`}>
              <p className="text-slate-700">
                You have been invited by <strong className="text-slate-900 font-semibold">{invitedBy}</strong> to become{' '}
                {isSuper ? (
                  <strong className="text-purple-900 font-bold">a Superadministrator</strong>
                ) : (
                  <strong className="text-emerald-900 font-bold">an Administrator</strong>
                )}{' '}
                for the EMS Dispensary system.
              </p>

              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                <span>Account:</span>
                <span className="font-bold text-slate-800">{canonicalEmail || emailParam}</span>
              </div>
            </div>

            {/* Scope / Privilege Card */}
            <div className={`p-3.5 rounded-xl border text-[11px] space-y-1.5 ${isSuper ? 'bg-purple-50 border-purple-200 text-purple-950' : 'bg-emerald-50 border-emerald-200 text-emerald-950'}`}>
              <span className="font-bold uppercase tracking-wider text-[10px] block">
                {isSuper ? 'Superadmin Privileges Granted:' : 'Administrator Privileges Granted:'}
              </span>
              <ul className="space-y-1 list-disc list-inside text-slate-700">
                {isSuper ? (
                  <>
                    <li>Invite &amp; delegate roles to new administrators</li>
                    <li>Full access to system audit logs &amp; activity records</li>
                    <li>Manage dispensary catalog, orders, and operational settings</li>
                  </>
                ) : (
                  <>
                    <li>Product catalog, stock &amp; category management</li>
                    <li>Order verification, processing &amp; counter payments</li>
                    <li>Dispensary operational reports and customer directory</li>
                  </>
                )}
              </ul>
            </div>

            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <button
              id="accept-invite-google-btn"
              type="button"
              onClick={handleAcceptWithGoogle}
              disabled={isSubmitting}
              className={`w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-semibold border-2 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-3 shadow-sm transition-all disabled:opacity-50 cursor-pointer ${
                isSuper ? 'hover:border-purple-600 border-slate-200' : 'hover:border-emerald-600 border-slate-200'
              }`}
            >
              {isSubmitting ? (
                <Loader2 size={18} className={`animate-spin ${isSuper ? 'text-purple-600' : 'text-emerald-600'}`} />
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              <span>
                {isSubmitting
                  ? 'Authenticating...'
                  : isSuper
                  ? 'Accept Superadmin Role & Sign In'
                  : 'Accept Invitation & Sign In with Google'}
              </span>
            </button>

            <div className="text-center pt-2">
              <Link to="/login" className="text-xs text-slate-500 hover:text-emerald-700 transition-colors">
                Already have active credentials? Log in directly
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
