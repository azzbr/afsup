// ADDED setDoc for auto-recovery
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, addDoc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { initializeAuth, signInAsAnonymous, onAuthStateChange, getUserData, signOutUser } from './auth';
import { ROLES } from './constants'; // Importing from new constants file

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
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  const isAuthenticated = user && !user.isAnonymous;

  // --- 1. Auth & User Data Loading ---
  useEffect(() => {
    initializeAuth();

    const unsubscribe = onAuthStateChange(async (u) => {
      if (!u) {
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF);
        setAuthLoading(false);
        return;
      }

      setUser(u);

      if (!u.isAnonymous) {
        try {
          // 1. Try to fetch user data immediately
          let result = await getUserData(u.uid);
          let currentUserData = null;

          if (result.success) {
            currentUserData = result.data;
          } else {
            // --- GRACE PERIOD FOR REGISTRATION ---
            // If data is missing, it might be a new registration in progress.
            // Wait 1.5 seconds to let LoginModal write the real data (FirstName, LastName, etc.)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Retry fetch
            result = await getUserData(u.uid);

            if (result.success) {
               currentUserData = result.data;
            } else {
               // --- SELF-HEALING (FALLBACK) ---
               // If still missing after wait, it's a true "Zombie" account. Fix it.
               console.warn("Auto-recovering missing profile for:", u.email);
               const skeletonData = {
                 uid: u.uid,
                 email: u.email,
                 displayName: u.displayName || u.email.split('@')[0],
                 role: 'staff',
                 status: 'pending',
                 createdAt: serverTimestamp(),
                 isActive: true,
                 firstName: 'Unknown',
                 lastName: 'User',
                 nationality: 'Bahraini',
                 iban: 'BH'
               };
               await setDoc(doc(db, 'users', u.uid), skeletonData);
               currentUserData = skeletonData;
            }
          }

          // --- SECURITY CHECK ---
          // Block pending users.
          // REMOVED ALERT to prevent UI freezing. LoginModal handles the success message now.
          if (currentUserData.status !== 'approved' && currentUserData.role !== 'admin') {
             // Just sign them out quietly. The LoginModal will show the "Success" message.
             await signOutUser();
             setUser(null);
             setUserData(null);
             setActiveRole(ROLES.STAFF);
             setAuthLoading(false);
             return;
          }

          setUserData(currentUserData);

          // AUTO-SWITCH ROLE
          if (currentUserData.viewAll || currentUserData.role === 'admin') {
             setActiveRole(ROLES.ADMIN);
          } else if (currentUserData.role === 'maintenance') {
             setActiveRole(ROLES.MAINTENANCE);
          } else if (currentUserData.role === 'hr') {
             setActiveRole(ROLES.HR);
          } else {
             setActiveRole(ROLES.STAFF);
          }

        } catch (err) {
          console.error("Error processing user:", err);
          await signOutUser();
        }
      } else {
        // Anonymous user
        setUserData(null);
        setActiveRole(ROLES.STAFF);
      }

      setAuthLoading(false);
    });

    return () => unsubscribe();
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
        console.error("Ticket fetch error:", error);
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
        console.error(err);
        alert(err.message);
    }
  };

  const handleDeleteTicket = async (id) => {
    if(confirm("Delete this ticket?")) await deleteDoc(doc(db, 'maintenance_tickets', id));
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

  const handleProfileClick = () => {
    setActiveRole('profile');
  };

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
              <p className="text-sm text-slate-500">Please provide details about the issue.</p>
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
