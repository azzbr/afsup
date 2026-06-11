// Root route element. Owns auth state, top-level modals, and the Layout shell.
// Child routes are rendered into <Outlet /> with auth state passed through
// outlet context — see routes/guards.tsx → useRouteContext().
//
// The auth flow here preserves the registration-race workaround from the
// original App.jsx (polling for the user doc + REGISTRATION_IN_PROGRESS flag).
// Phase 2 will replace that with a Cloud Function invitation handler and
// delete this defensive code — see CLAUDE.md section 7a.

import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { onSnapshot, doc, getDoc } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';

import { db } from '../firebase';
import { initializeAuth, onAuthStateChange, signOutUser } from '../auth';
import { ROLES } from '../constants';
import { actorFrom, isAdminTierRole } from '../permissions';
import { queryClient } from '../data/queryClient';

import Layout from '../Layout';
import LoginModal from '../components/LoginModal';

export default function RootLayout() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showLoginModal, setShowLoginModal] = useState(false);

  const navigate = useNavigate();

  // --- Auth bootstrap + user document subscription ---
  useEffect(() => {
    initializeAuth();

    let unsubscribeDoc = null;
    let timeoutId = null;

    const unsubscribeAuth = onAuthStateChange(async (u) => {
      if (unsubscribeDoc) { unsubscribeDoc(); unsubscribeDoc = null; }
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

      if (!u) {
        setUser(null);
        setUserData(null);
        setAuthLoading(false);
        return;
      }

      // Registration-in-progress: auth.js owns the user creation flow; bail.
      if (localStorage.getItem('REGISTRATION_IN_PROGRESS') === 'true') {
        return;
      }

      setUser(u);

      if (u.isAnonymous) {
        setUserData(null);
        setAuthLoading(false);
        return;
      }

      // Poll until the user doc exists (race-condition workaround).
      const userDocRef = doc(db, 'users', u.uid);
      let docExists = false;
      for (let attempt = 1; attempt <= 10 && !docExists; attempt++) {
        if (attempt > 1) await new Promise((r) => setTimeout(r, 500));
        try {
          const snap = await getDoc(userDocRef);
          if (snap.exists()) {
            const data = snap.data();
            if (data && data.uid === u.uid && data.email) docExists = true;
          }
        } catch (err) {
          console.error('Error checking user doc:', err);
        }
      }

      if (!docExists) {
        alert('Registration incomplete. Please try logging in again.');
        await signOutUser();
        setAuthLoading(false);
        return;
      }

      let hasTimedOut = false;
      timeoutId = setTimeout(async () => {
        hasTimedOut = true;
        if (unsubscribeDoc) unsubscribeDoc();
        alert('System Timeout: Unable to load your profile.');
        await signOutUser();
        setAuthLoading(false);
      }, 10000);

      unsubscribeDoc = onSnapshot(
        userDocRef,
        async (snap) => {
          if (hasTimedOut) return;
          clearTimeout(timeoutId);

          if (snap.exists()) {
            const data = snap.data();
            // Blocked/suspended users are ALWAYS signed out, regardless of
            // role — an admin must not bypass a block. Other non-approved
            // statuses (invited/pending) keep the legacy exemption for the
            // whole admin tier (admin + super_admin).
            const isBlockedOrSuspended = data.status === 'blocked' || data.status === 'suspended';
            if (isBlockedOrSuspended || (data.status !== 'approved' && !isAdminTierRole(data.role))) {
              await signOutUser();
              queryClient.clear();
              setUser(null);
              setUserData(null);
              setAuthLoading(false);
              return;
            }
            setUserData(data);
            setAuthLoading(false);
          }
        },
        (error) => {
          if (hasTimedOut) return;
          clearTimeout(timeoutId);
          console.error('Profile fetch error', error);
          alert('Database Error: ' + error.message);
          signOutUser();
          setAuthLoading(false);
        },
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // Post-login: route to the most useful landing page for this role.
  // Uses a ref instead of state so we don't trigger an extra render or
  // run afoul of "no setState in effects" lint guidance.
  const postLoginNavigatedRef = useRef(false);
  useEffect(() => {
    if (!userData) {
      postLoginNavigatedRef.current = false;
      return;
    }
    if (postLoginNavigatedRef.current) return;
    postLoginNavigatedRef.current = true;

    // Only redirect if we're sitting on the public landing.
    if (window.location.pathname !== '/') return;

    if (userData.viewAll || userData.role === ROLES.ADMIN) navigate('/admin');
    else if (userData.role === ROLES.HR) navigate('/hr');
    else if (userData.role === ROLES.MAINTENANCE) navigate('/maintenance');
    // Staff role: already on '/', no redirect needed.
  }, [userData, navigate]);

  const handleSignOut = async () => {
    await signOutUser();
    // Drop all cached query data so HR/profile data does not survive a
    // sign-out on shared school computers.
    queryClient.clear();
    navigate('/');
  };

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium">Loading System...</p>
        </div>
      </div>
    );
  }

  const actor = actorFrom(userData);
  const outletContext = {
    user,
    userData,
    actor,
    onLoginClick: () => setShowLoginModal(true),
    onSignOut: handleSignOut,
  };

  return (
    <>
      <Layout
        user={user}
        userData={userData}
        onSignOut={handleSignOut}
        onLoginClick={() => setShowLoginModal(true)}
      >
        <Outlet context={outletContext} />
      </Layout>

      {showLoginModal && (
        <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      )}
    </>
  );
}
