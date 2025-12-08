import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, addDoc, getDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { initializeAuth, onAuthStateChange, signOutUser } from './auth';
import { ROLES } from './constants';

// Components
import Layout from './Layout';
import MaintenanceView from './MaintenanceView';
import AdminView from './AdminView';
import UserProfile from './UserProfile';
import ReportForm from './components/ReportForm';
import EnhancedScheduleForm from './enhanced_scheduler';
import LoginModal from './components/LoginModal';
import HRSystem from './HRsys/HRSystem';

import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeRole, setActiveRole] = useState(ROLES.STAFF);
  const [tickets, setTickets] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const isAuthenticated = user && !user.isAnonymous;

  // --- 1. Auth & User Data Loading (WITH REGISTRATION FLAG CHECK) ---
  useEffect(() => {
    initializeAuth();

    let unsubscribeDoc = null;
    let timeoutId = null;

    const unsubscribeAuth = onAuthStateChange(async (u) => {
      // Cleanup previous listeners
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = null;
      }
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!u) {
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      // ===  CRITICAL CHECK: Is registration in progress? ===
      const registrationInProgress = localStorage.getItem('REGISTRATION_IN_PROGRESS');
      if (registrationInProgress === 'true') {
        console.log('⚠️ Registration in progress - App.jsx will not process this user');
        // Don't set user, don't start listeners, just exit
        // auth.js will handle everything and clear the flag when done
        return;
      }

      setUser(u);

      if (u.isAnonymous) {
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      // --- Poll until document exists ---
      console.log('🔵 Waiting for user document...');

      const userDocRef = doc(db, 'users', u.uid);

      let docExists = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!docExists && attempts < maxAttempts) {
        attempts++;
        console.log(`🔵 Attempt ${attempts}/${maxAttempts}: Checking document...`);
        
        try {
          if (attempts > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          const docSnap = await getDoc(userDocRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data && data.uid === u.uid && data.email) {
              docExists = true;
              console.log('✅ Document verified and ready!');
            } else {
              console.log('⚠️ Document exists but data incomplete, retrying...');
            }
          } else {
            console.log('⚠️ Document does not exist yet, retrying...');
          }
        } catch (error) {
          console.error('⚠️ Error checking document:', error);
        }
      }

      if (!docExists) {
        console.error('❌ Document verification timeout');
        alert('Registration incomplete. Please try logging in again.');
        await signOutUser();
        setAuthLoading(false);
        return;
      }

      // --- Start real-time listener ---

      let hasTimedOut = false;

      timeoutId = setTimeout(async () => {
        hasTimedOut = true;
        console.error("Timeout waiting for user profile");
        if (unsubscribeDoc) unsubscribeDoc();
        alert("System Timeout: Unable to load your profile.");
        await signOutUser();
        setAuthLoading(false);
      }, 10000);

      unsubscribeDoc = onSnapshot(userDocRef, async (docSnap) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutId);

        if (docSnap.exists()) {
          const data = docSnap.data();

          // SECURITY CHECK: Block Pending Users
          if (data.status !== 'approved' && data.role !== 'admin') {
             await signOutUser();
             setUser(null);
             setUserData(null);
             setActiveRole(ROLES.STAFF);
             setAuthLoading(false);
             return;
          }

          setUserData(data);

          // Role Switching
          if (data.viewAll || data.role === 'admin') {
             setActiveRole(ROLES.ADMIN);
          } else if (data.role === 'maintenance') {
             setActiveRole(ROLES.MAINTENANCE);
          } else if (data.role === 'hr') {
             setActiveRole(ROLES.HR);
          } else {
             setActiveRole(ROLES.STAFF);
          }
          setAuthLoading(false);
        }
      }, (error) => {
        if (hasTimedOut) return;
        clearTimeout(timeoutId);
        console.error("Profile fetch error", error);
        alert("Database Error: " + error.message);
        signOutUser();
        setAuthLoading(false);
      });
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeDoc) unsubscribeDoc();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);

  // --- 2. Ticket Fetching ---
  useEffect(() => {
    if (authLoading) return;

    let q;
    const collectionRef = collection(db, 'maintenance_tickets');

    if (userData && (userData.role === 'admin' || userData.role === 'maintenance')) {
        q = collectionRef;
    } else if (user) {
        q = query(collectionRef, where('reportedBy', '==', user.uid));
    } else {
        setTickets([]);
        return;
    }

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date()
      }));

      data.sort((a, b) => {
        if (a.status === 'resolved' && b.status !== 'resolved') return 1;
        if (a.status !== 'resolved' && b.status === 'resolved') return -1;
        return b.createdAt - a.createdAt;
      });
      setTickets(data);
    }, (error) => {
        if (error.code === 'permission-denied') setTickets([]);
    });

    return () => unsub();
  }, [user, userData, authLoading]);

  // --- 3. Handlers ---
  const handleCreateSchedule = async (data) => {
    try {
        const enhancedData = {
            ...data,
            createdAt: serverTimestamp(),
            createdBy: user.uid,
            lastRun: data.isStartImmediately ? serverTimestamp() : null,
            isActive: true,
            totalLocations: data.locations.length,
            nextDue: data.nextRun ? new Date(data.nextRun) : null
        };
        await addDoc(collection(db, 'scheduled_tasks'), enhancedData);
        setShowScheduleForm(false);
        alert("Schedule Created Successfully");
    } catch(err) {
        alert(err.message);
    }
  };

  const handleDeleteTicket = async (id) => {
    if(confirm("Delete this ticket?")) await deleteDoc(doc(db, 'maintenance_tickets', id));
  };

  const handleProfileClick = () => {
    setActiveRole('profile');
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

  return (
    <Layout
      user={user}
      userData={userData}
      activeRole={activeRole}
      setActiveRole={setActiveRole}
      onSignOut={signOutUser}
      onLoginClick={() => setShowLoginModal(true)}
      onProfileClick={handleProfileClick}
    >
      {activeRole !== ROLES.STAFF && (
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
            {activeRole === ROLES.ADMIN ? 'Admin Overview' :
             activeRole === ROLES.HR ? 'HR Management' :
             activeRole === ROLES.MAINTENANCE ? 'Maintenance Queue' :
             activeRole === 'profile' ? 'My Profile' :
             activeRole === 'user_info' ? 'User Information' :
             'Support Portal'}
          </h1>
          <p className="text-slate-500 mt-1">
            {activeRole === 'profile' ? 'View and update your personal information.' :
             activeRole === 'user_info' ? 'Staff directory and contact information.' :
             'Manage school operations and maintenance tasks.'}
          </p>
        </div>
      )}

      {/* 1. STAFF VIEW */}
      {activeRole === ROLES.STAFF && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-900">Submit New Request</h2>
              <p className="text-sm text-slate-500">Please describe the issue.</p>
            </div>
            <div className="p-6">
              <ReportForm user={user} onSuccess={() => alert('Report Submitted!')} />
            </div>
          </div>
        </div>
      )}

      {/* 2. MAINTENANCE VIEW */}
      {isAuthenticated && activeRole === ROLES.MAINTENANCE && (
        <MaintenanceView tickets={tickets} user={user} userData={userData} />
      )}

      {/* 3. ADMIN VIEW */}
      {isAuthenticated && activeRole === ROLES.ADMIN && (
        <AdminView
          tickets={tickets}
          user={user}
          userData={userData}
          onCreateSchedule={() => setShowScheduleForm(true)}
          onDeleteTicket={handleDeleteTicket}
        />
      )}

      {/* 4. USER INFO / HR SYSTEM */}
      {isAuthenticated && (activeRole === 'user_info' || activeRole === ROLES.HR) && (
        <HRSystem user={user} userData={userData} />
      )}

      {/* 5. PROFILE VIEW */}
      {isAuthenticated && activeRole === 'profile' && (
        <UserProfile userData={userData} user={user} />
      )}

      {showLoginModal && (
        <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      )}

      {showScheduleForm && (
        <EnhancedScheduleForm
          isOpen={showScheduleForm}
          onClose={() => setShowScheduleForm(false)}
          onSubmit={handleCreateSchedule}
          user={user}
        />
      )}

    </Layout>
  );
}