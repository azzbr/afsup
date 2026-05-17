// /accept-invite?token=...&email=...
//
// Landing page for invitees clicking the link from their invitation email.
// Validates the invitation, lets the user choose a password, calls the
// acceptInvite Cloud Function, signs them in with the returned custom token,
// then redirects to the post-login landing.

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { Loader2, CheckCircle, AlertTriangle, Lock } from 'lucide-react';

import { auth, db, functions } from '../firebase';

const MIN_PW_LEN = 8;

export default function AcceptInviteRoute() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [invite, setInvite] = useState(null); // { uid, email, role, expiresAt, consumed } | null
  const [loading, setLoading] = useState(true);
  const [validationError, setValidationError] = useState(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Validate the invitation when the page mounts.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token || !email) {
        setValidationError('Missing invitation token or email in the link.');
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'invitations', token));
        if (cancelled) return;
        if (!snap.exists()) {
          setValidationError('This invitation could not be found. It may have already been used.');
        } else {
          const data = snap.data();
          if (data.consumed) {
            setValidationError('This invitation has already been used.');
          } else if (data.email !== email.toLowerCase()) {
            setValidationError('This invitation link does not match the provided email.');
          } else {
            const expiresAt = data.expiresAt?.toDate?.() ?? data.expiresAt;
            if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
              setValidationError('This invitation has expired. Ask HR to send a new one.');
            } else {
              setInvite(data);
            }
          }
        }
      } catch (err) {
        if (!cancelled) setValidationError('Could not validate invitation: ' + err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token, email]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirm) {
      setSubmitError('Passwords do not match.');
      return;
    }
    if (password.length < MIN_PW_LEN) {
      setSubmitError(`Password must be at least ${MIN_PW_LEN} characters.`);
      return;
    }
    setSubmitting(true);
    try {
      const callable = httpsCallable(functions, 'acceptInvite');
      const result = await callable({ token, email, password });
      const { customToken } = result.data;
      await signInWithCustomToken(auth, customToken);
      // Signed in! RootLayout will pick up the auth change and the post-login
      // redirect effect will send them to their role's home.
      navigate('/');
    } catch (err) {
      console.error('acceptInvite failed', err);
      setSubmitError(err.message || 'Failed to activate account.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Render states ----

  if (loading) {
    return (
      <CenteredCard>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-slate-500 mt-3 font-medium">Validating invitation…</p>
      </CenteredCard>
    );
  }

  if (validationError) {
    return (
      <CenteredCard>
        <AlertTriangle className="w-10 h-10 text-red-500 mb-3" />
        <h2 className="text-xl font-bold text-slate-900 mb-1">Invitation invalid</h2>
        <p className="text-slate-600 text-sm">{validationError}</p>
      </CenteredCard>
    );
  }

  return (
    <CenteredCard>
      <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
      <h2 className="text-xl font-bold text-slate-900 mb-1">Welcome to Al Fajer</h2>
      <p className="text-slate-600 text-sm mb-1">
        Set a password to activate your account.
      </p>
      <p className="text-slate-400 text-xs mb-6">
        Email: <span className="font-medium text-slate-600">{invite.email}</span> &middot;{' '}
        Role: <span className="font-medium text-slate-600 capitalize">{invite.role}</span>
      </p>

      <form onSubmit={handleSubmit} className="w-full space-y-3">
        {submitError && (
          <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-200">
            {submitError}
          </div>
        )}
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
          <input
            type="password"
            required
            minLength={MIN_PW_LEN}
            placeholder={`New password (min ${MIN_PW_LEN} chars)`}
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="relative">
          <Lock className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
          <input
            type="password"
            required
            minLength={MIN_PW_LEN}
            placeholder="Confirm password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Activating…' : 'Activate Account'}
        </button>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }) {
  return (
    <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 w-full max-w-md flex flex-col items-center text-center">
        {children}
      </div>
    </div>
  );
}
