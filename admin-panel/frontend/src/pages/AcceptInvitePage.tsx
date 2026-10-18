import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, AlertCircle, CheckCircle2, Loader2, ArrowRight } from 'lucide-react';
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

  const [isLoading, setIsLoading] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const [invitedBy, setInvitedBy] = useState<string>('EMS Administrator');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptedSuccess, setAcceptedSuccess] = useState(false);

  useEffect(() => {
    async function checkToken() {
      if (!token || !emailParam) {
        setErrorMsg('Invalid or incomplete invitation link. Missing token or email parameter.');
        setIsLoading(false);
        return;
      }

      try {
        const res = await verifyInvitation(token, emailParam);
        if (res.valid) {
          setIsValid(true);
          if (res.invitedBy) setInvitedBy(res.invitedBy);
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

    try {
      const provider = new GoogleAuthProvider();
      // Hint Google to prompt the invited email
      provider.setCustomParameters({
        login_hint: emailParam,
        prompt: 'select_account',
      });

      const cred = await signInWithPopup(auth, provider);
      const loggedEmail = cred.user.email?.toLowerCase();

      if (loggedEmail !== emailParam.toLowerCase()) {
        setErrorMsg(
          `You signed in with ${loggedEmail}, but this invitation was issued to ${emailParam}. Please sign in with ${emailParam}.`
        );
        setIsSubmitting(false);
        return;
      }

      // Call backend to accept token and grant admin claim
      await acceptInvitation(token);

      // Force refresh user claims so the app recognizes them as an admin immediately
      await refreshClaims();

      setAcceptedSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err: any) {
      console.error('Accept invitation error:', err);
      let msg = 'Failed to accept invitation. Please try again.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in popup was closed before completing.';
      } else if (err.message) {
        msg = err.message;
      }
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 border border-slate-200 shadow-xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-700 text-white flex items-center justify-center mx-auto shadow-md">
            <ShieldCheck size={30} />
          </div>
          <div>
            <span className="text-[11px] font-bold tracking-wider uppercase text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              EMS Dispensary
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display mt-2">
              Administrator Invitation
            </h1>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
            <Loader2 size={32} className="animate-spin text-emerald-600" />
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
          <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-center space-y-2">
            <CheckCircle2 size={36} className="text-emerald-600 mx-auto" />
            <h3 className="font-bold text-base">Invitation Accepted!</h3>
            <p className="text-xs text-emerald-700">
              Your administrator privileges are now active. Redirecting to dispensary dashboard...
            </p>
          </div>
        )}

        {/* Valid State: Prompt to Accept */}
        {!isLoading && isValid && !acceptedSuccess && (
          <div className="space-y-5">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <p className="text-slate-600">
                You have been invited by <strong className="text-slate-900">{invitedBy}</strong> to become an Administrator for the EMS Dispensary system.
              </p>
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                <span>Invited Account:</span>
                <span className="font-mono font-semibold text-slate-800">{emailParam}</span>
              </div>
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
              className="w-full py-3.5 px-4 rounded-xl text-xs sm:text-sm font-semibold border-2 border-slate-200 bg-white hover:bg-slate-50 text-slate-700 flex items-center justify-center gap-3 shadow-sm transition-all disabled:opacity-50 hover:border-emerald-500"
            >
              {isSubmitting ? (
                <Loader2 size={18} className="animate-spin text-emerald-600" />
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
              <span>{isSubmitting ? 'Authenticating...' : 'Accept Invitation & Sign In with Google'}</span>
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
