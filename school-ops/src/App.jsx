// CHANGE: Import 'query' and 'where' to filter tickets for staff
import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, deleteDoc, doc, addDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { initializeAuth, signInAsAnonymous, onAuthStateChange, getUserData, signOutUser } from './auth';
import { ROLES } from './constants'; // Importing from new constants file

// Components
import Layout from './Layout';
import MaintenanceView from './MaintenanceView';
import AdminView from './AdminView';
import ReportForm from './components/ReportForm';
import EnhancedScheduleForm from './enhanced_scheduler';
import LoginModal from './components/LoginModal';

import { Loader2 } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeRole, setActiveRole] = useState(ROLES.STAFF);
  const [tickets, setTickets] = useState([]);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [authLoading, setAuthLoading] = useState(true); // Fixes the flickering/wrong role issue

  const isAuthenticated = user && !user.isAnonymous;

  // --- 1. Auth & User Data Loading ---
  useEffect(() => {
    initializeAuth();

    const unsubscribe = onAuthStateChange(async (u) => {
      if (!u) {
        // User is logged out - allow guest access to staff view
        setUser(null);
        setUserData(null);
        setActiveRole(ROLES.STAFF); // Default to staff view for guest access
        setAuthLoading(false);
        return;
      }

      setUser(u);

      // If it's a real user (Admin/Staff), fetch their profile
      if (!u.isAnonymous) {
        try {
          const result = await getUserData(u.uid);
          if (result.success) {
            const data = result.data;

            // --- SECURITY PATCH: BLOCK PENDING USERS ---
            // If user is pending or blocked (and not the super admin), kick them out.
            if (data.status !== 'approved' && data.role !== 'admin') {
               alert("Access Denied: Your account is pending approval by an administrator.");
               await signOutUser(); // Log them out immediately
               setUser(null);
               setUserData(null);
               setActiveRole(ROLES.STAFF);
               setAuthLoading(false);
               return; // Stop execution
            }
            // -------------------------------------------

            setUserData(data);

            // AUTO-SWITCH ROLE based on permission
            if (data.viewAll || data.role === 'admin') {
               setActiveRole(ROLES.ADMIN);
            } else if (data.role === 'maintenance') {
               setActiveRole(ROLES.MAINTENANCE);
            } else {
               setActiveRole(ROLES.STAFF);
            }
          }
        } catch (err) {
          console.error("Error fetching user data", err);
        }
      } else {
        // Anonymous user = Guest/Staff view
        setUserData(null);
        setActiveRole(ROLES.STAFF);
      }

      // Stop loading once we have made decisions
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // --- 2. Ticket Fetching (SECURE VERSION) ---
  useEffect(() => {
    // We only fetch tickets if we know the user's role (authLoading is false)
    if (authLoading) return;

    let q;
    const collectionRef = collection(db, 'maintenance_tickets');

    // SECURITY LOGIC:
    // 1. Admins & Maintenance can see EVERYTHING.
    // 2. Staff/Guests can ONLY see tickets THEY created.
    // 3. If we try to query ALL tickets as a Staff, the Rules will block it (Crash).

    if (userData && (userData.role === 'admin' || userData.role === 'maintenance')) {
        // Fetch all tickets
        q = collectionRef;
    } else if (user) {
        // Fetch only MY tickets (satisfies rule: resource.data.reportedBy == request.auth.uid)
        q = query(collectionRef, where('reportedBy', '==', user.uid));
    } else {
        // No user? No tickets.
        setTickets([]);
        return;
    }

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() || new Date()
      }));

      // Sort: Open first, then new to old
      data.sort((a, b) => {
        if (a.status === 'resolved' && b.status !== 'resolved') return 1;
        if (a.status !== 'resolved' && b.status === 'resolved') return -1;
        return b.createdAt - a.createdAt;
      });
      setTickets(data);
    }, (error) => {
        // Handle permission errors gracefully
        console.error("Ticket fetch error (likely permissions):", error);
        if (error.code === 'permission-denied') {
            setTickets([]); // Clear tickets rather than crashing
        }
    });

    return () => unsub();
  }, [user, userData, authLoading]); // Re-run when user or role changes

  // --- 3. Handlers ---
  const handleCreateSchedule = async (data) => {
    // Your existing schedule logic here...
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

  // --- 4. Loading State (Prevents UI glitches) ---
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

  // --- 5. Main Render ---
  return (
    <Layout
      user={user}
      userData={userData}
      activeRole={activeRole}
      setActiveRole={setActiveRole}
      onSignOut={signOutUser}
      onLoginClick={() => setShowLoginModal(true)}
    >
      {/* Header Section */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900">
          {activeRole === ROLES.ADMIN ? 'Admin Overview' :
           activeRole === ROLES.MAINTENANCE ? 'Maintenance Queue' :
           'Support Portal'}
        </h1>
        <p className="text-slate-500 mt-1">
          {activeRole === ROLES.STAFF ? 'Submit maintenance requests and track their status.' :
           'Manage school operations and maintenance tasks.'}
        </p>
      </div>

      {/* --- CONTENT SWITCHER --- */}

      {/* 1. STAFF VIEW (Everyone can see this) */}
      {activeRole === ROLES.STAFF && (
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-lg font-semibold text-slate-900">Submit New Request</h2>
              <p className="text-sm text-slate-500">Please provide details about the issue.</p>
            </div>
            <div className="p-6">
              {/* We need to refactor ReportForm to separate file next, but for now passing inline props */}
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

      {/* --- MODALS --- */}
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
