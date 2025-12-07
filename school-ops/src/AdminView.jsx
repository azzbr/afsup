import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, collection, getDocs, deleteDoc, getDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import {
  ShieldAlert, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown,
  MapPin, User, FileText, Camera, X, Trash2, Pause, Play, RefreshCw,
  Calendar, Search, Loader2, FolderOpen, UploadCloud, Download, Filter,
  MessageSquare, Timer
} from 'lucide-react';

// --- Sub-components (Badges) ---

const StatusBadge = ({ status }) => {
  const styles = {
    open: "bg-red-50 text-red-700 border-red-100",
    in_progress: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100"
  };
  const labels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved' };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${styles[status] || styles.open}`}>
      {labels[status] || status}
    </span>
  );
};

const PriorityBadge = ({ priority }) => {
  const styles = {
    low: "bg-slate-100 text-slate-600",
    medium: "bg-blue-50 text-blue-700",
    high: "bg-orange-50 text-orange-700",
    critical: "bg-red-600 text-white animate-pulse"
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${styles[priority] || styles.medium}`}>
      {priority}
    </span>
  );
};

// --- Modals ---

function TicketDetailModal({ isOpen, onClose, ticket }) {
  const [selectedImage, setSelectedImage] = useState(null);
  if (!isOpen || !ticket) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">{ticket.category}</h3>
            <div className="flex gap-2">
              <PriorityBadge priority={ticket.priority} />
              <StatusBadge status={ticket.status} />
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex gap-3">
              <MapPin className="w-5 h-5 text-indigo-500 mt-1" />
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Location</p>
                <p className="text-slate-700 font-medium">{ticket.location}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <User className="w-5 h-5 text-indigo-500 mt-1" />
              <div>
                <p className="text-xs text-slate-400 uppercase font-semibold">Reported By</p>
                <p className="text-slate-700 font-medium">{ticket.reporterName || 'Anonymous'}</p>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
            <div className="flex gap-3">
              <FileText className="w-5 h-5 text-indigo-500 mt-1" />
              <div className="flex-1">
                <p className="text-xs text-slate-400 uppercase font-semibold mb-1">Description</p>
                <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
              </div>
            </div>
          </div>

          {ticket.imageUrls?.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <Camera className="w-4 h-4" /> Photos
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {ticket.imageUrls.map((url, i) => (
                  <img
                    key={i} src={url} alt="Proof"
                    className="h-20 w-full object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-90"
                    onClick={() => setSelectedImage(url)}
                  />
                ))}
              </div>
            </div>
          )}

          {ticket.status === 'resolved' && (
            <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
              <p className="text-emerald-800 text-sm font-medium flex items-center gap-2">
                <CheckCircle className="w-4 h-4" /> Resolved
              </p>
              {ticket.completionNotes && <p className="text-emerald-700 text-sm mt-1">{ticket.completionNotes}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
            Close Details
          </button>
        </div>
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
          <img src={selectedImage} className="max-w-full max-h-full rounded-lg" alt="Full view" />
          <button className="absolute top-4 right-4 text-white hover:text-red-400"><X className="w-8 h-8" /></button>
        </div>
      )}
    </div>
  );
}

// --- Main Admin View Component ---
// Note: This comment triggers a fresh deployment commit

export default function AdminView({
  tickets = [],
  user,
  userData,
  onCreateSchedule,
  onDeleteTicket,
  initialTab
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [allUsers, setAllUsers] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [hrAlerts, setHrAlerts] = useState([]); // HR Compliance Alerts
  const [pendingLeaveRequests, setPendingLeaveRequests] = useState([]); // Pending leave notifications
  const [notificationBadges, setNotificationBadges] = useState({}); // Badge counts
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedUserDocs, setSelectedUserDocs] = useState({});
  const [selectedUserName, setSelectedUserName] = useState('');

  // New state for loading feedback
  const [actionLoading, setActionLoading] = useState(null); // Stores the ID of the user being updated

  useEffect(() => { fetchData(); }, [user, userData]);

  // 1. FILTER LOGIC: Who can see whom?
  const getVisibleUsers = () => {
    if (!userData || !allUsers) return [];

    const myRole = userData.role;

    return allUsers.filter(targetUser => {
      const targetRole = targetUser.role || 'staff';

      // ADMIN: Sees everyone
      if (myRole === 'admin') return true;

      // HR: Sees Staff, Maintenance, and HR. CANNOT SEE ADMIN.
      if (myRole === 'hr') {
        return ['staff', 'maintenance', 'hr'].includes(targetRole);
      }

      // MAINTENANCE: Sees Staff and Maintenance. Cannot see HR or Admin.
      if (myRole === 'maintenance') {
        return ['staff', 'maintenance'].includes(targetRole);
      }

      // STAFF: Sees only Staff (but this will rarely be called since they won't have access to this view)
      if (myRole === 'staff') {
        return targetRole === 'staff';
      }

      return false;
    });
  };

  const visibleUsers = getVisibleUsers();

  // 2. PERMISSION LOGIC: Who can edit/view docs?
  // Only Admin and HR can see the "Actions" column (Edit, Docs, Delete)
  const canManageUsers = ['admin', 'hr'].includes(userData?.role);

  // --- HR ALERTS CALCULATION: Bahrain Compliance Monitoring ---
  const calculateHRAlerts = (users) => {
    const now = new Date();
    const threeMonthsFromNow = new Date(); threeMonthsFromNow.setMonth(now.getMonth() + 3);
    const oneMonthFromNow = new Date(); oneMonthFromNow.setMonth(now.getMonth() + 1);

    const alerts = [];

    users.forEach(u => {
      // 1. CPR Expiry Check (Critical for all Bahrain residents)
      if (u.cprExpiry && u.cprExpiry.toDate) {
         const expiry = u.cprExpiry.toDate();
         if (expiry < now) {
           alerts.push({
             type: 'expired',
             priority: 'critical',
             msg: `❌ CPR EXPIRED: ${u.displayName || u.email}`,
             employee: u.displayName,
             detail: 'Immediate action required - suspend access if needed'
           });
         } else if (expiry < threeMonthsFromNow) {
           alerts.push({
             type: 'warning',
             priority: 'warning',
             msg: `⚠️ CPR Expiring Soon: ${u.displayName || u.email}`,
             employee: u.displayName,
             detail: `Expires: ${expiry.toLocaleDateString()}`
           });
         }
      }

      // 2. VISA Expiry Check (Only for Non-Bahrainis - LMRA Critical)
      if (u.nationality !== 'Bahraini' && u.residencePermitExpiry && u.residencePermitExpiry.toDate) {
         const expiry = u.residencePermitExpiry.toDate();
         if (expiry < now) {
           alerts.push({
             type: 'expired',
             priority: 'critical',
             msg: `🚨 VISA EXPIRED: ${u.displayName || u.email}`,
             employee: u.displayName,
             detail: 'LMRA violations possible - legal action needed'
           });
         } else if (expiry < oneMonthFromNow) {
           alerts.push({
             type: 'warning',
             priority: 'warning',
             msg: `⚠️ Visa Expiring: ${u.displayName || u.email}`,
             employee: u.displayName,
             detail: `RP expires: ${expiry.toLocaleDateString()}`
           });
         }
      }

      // 3. Bank IBAN Missing/Incomplete
      if (!u.iban || !u.iban.startsWith('BH')) {
        alerts.push({
          type: 'incomplete',
          priority: 'info',
          msg: `📝 Missing/Invalid IBAN: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: 'WPS compliance requires complete IBAN for salary payments'
        });
      }

      // 4. Arabic Name Missing (GOSI Requirement)
      if (!u.arabicName && u.nationality === 'Bahraini') {
        alerts.push({
          type: 'incomplete',
          priority: 'info',
          msg: `📝 Arabic Name Missing: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: 'Required for GOSI & official Ministry documents'
        });
      }
    });

    // Sort by priority (critical first, then warnings, then info)
    return alerts.sort((a, b) => {
      const priorityOrder = { critical: 3, warning: 2, info: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  };

  const fetchData = async () => {
    try {
      const usersDocs = await getDocs(collection(db, 'users'));
      const users = usersDocs.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllUsers(users);

      // Calculate and set HR alerts
      const alerts = calculateHRAlerts(users);
      setHrAlerts(alerts);

      // Load pending leave requests
      const leaveQuery = query(collection(db, 'leave_requests'),
                               where('status', '==', 'pending'),
                               orderBy('submittedAt', 'desc'));
      const leaveDocs = await getDocs(leaveQuery);
      const leaveRequests = leaveDocs.docs.map(d => ({ id: d.id, ...d.data() }));
      setPendingLeaveRequests(leaveRequests);

      const schedulesDocs = await getDocs(collection(db, 'scheduled_tasks'));
      setAllSchedules(schedulesDocs.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error("Fetch error:", e); }
  };

  const ticketStats = tickets.reduce((a, t) => {
    if (t.priority === 'critical' && t.status !== 'resolved') a.critical++;
    if (t.status === 'open') a.backlog++;
    if (t.status === 'in_progress') a.inProgress++;
    if (t.status === 'resolved') a.resolved++;
    return a;
  }, { critical: 0, backlog: 0, inProgress: 0, resolved: 0 });

  // --- ROBUST UPDATE FUNCTION (Fixes the issue) ---
  const updateUser = async (userId, newStatus) => {
    // 1. Set loading state for feedback
    setActionLoading(userId);

    try {
      const userRef = doc(db, 'users', userId);

      console.log(`Attempting to update user ${userId} to ${newStatus}...`);

      // 2. Perform the Update
      await updateDoc(userRef, {
        status: newStatus,
        [`${newStatus}At`]: serverTimestamp(),
        // Ensure role exists if approving
        isActive: newStatus === 'approved' ? true : false
      });

      // 3. Verification Step (Double check database)
      const verifySnap = await getDoc(userRef);
      if (verifySnap.exists() && verifySnap.data().status !== newStatus) {
        throw new Error("Database verification failed. The update was rejected.");
      }

      // 4. Success Feedback
      alert(`Success: User marked as ${newStatus}`);
      await fetchData(); // Refresh UI with real server data

    } catch (error) {
      console.error("Update failed:", error);
      // 5. Error Handling: Show the REAL reason (e.g., "Missing Permissions")
      alert(`Update Failed: ${error.message}\n\nCheck if your account has 'admin' role in the database.`);

      // Force refresh to revert UI if it was optimistic
      fetchData();
    } finally {
      setActionLoading(null);
    }
  };

  const updateRole = async (userId, newRole) => {
    setActionLoading(userId);
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      await fetchData();
      setOpenDropdown(null);
      alert(`Role updated to ${newRole}`);
    } catch (error) {
      console.error(error);
      alert("Failed to update role: " + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async (userId) => {
    if (confirm("Delete this user permanently?")) {
      await deleteDoc(doc(db, 'users', userId));
      fetchData();
    }
  };

  const processLeaveRequest = async (request, status) => {
    try {
      const actionLoadingKey = `leave_${request.id}`;

      // 1. Prevent duplicate processing
      setActionLoading(actionLoadingKey);

      // 2. Update leave request status
      await updateDoc(doc(db, 'leave_requests', request.id), {
        status,
        processedAt: serverTimestamp(),
        processedBy: user.uid
      });

      // 3. If approved, deduct from annual leave balance
      if (status === 'approved') {
        const userRef = doc(db, 'users', request.userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
          const currentBalance = userDoc.data().annualLeaveBalance || 0;
          const newBalance = Math.max(0, currentBalance - request.daysRequested);

          await updateDoc(userRef, {
            annualLeaveBalance: newBalance,
            updatedAt: serverTimestamp()
          });
        }
      }

      // 4. Success message and refresh
      const statusText = status === 'approved' ? 'Approved' : 'Rejected';
      alert(`Leave request ${statusText.toLowerCase()} for ${request.employeeName}`);
      await fetchData();

    } catch (error) {
      console.error('Error processing leave request:', error);
      alert('Error processing leave request: ' + error.message);
    } finally {
      setActionLoading(null);
    }
  };

  // Toggle escalate - if critical, revert to original. If not, escalate to critical
  const escalateTicket = async (ticketId, currentPriority, originalPriority) => {
    try {
      if (currentPriority === 'critical') {
        // De-escalate: Revert to original priority
        const revertTo = originalPriority || 'medium';
        await updateDoc(doc(db, 'maintenance_tickets', ticketId), { 
          priority: revertTo, 
          escalated: false 
        });
      } else {
        // Escalate: Save original and set to critical
        await updateDoc(doc(db, 'maintenance_tickets', ticketId), { 
          priority: 'critical', 
          originalPriority: currentPriority, // Save original for reverting
          escalated: true 
        });
      }
    } catch (e) {
      console.error("Escalation error:", e);
      alert("Failed to update priority");
    }
  };

  return (
    <div className="space-y-6">

      {/* --- Admin Stats Cards --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Critical Issues', value: ticketStats.critical, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
          { label: 'Open Backlog', value: ticketStats.backlog, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
          { label: 'In Progress', value: ticketStats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
          { label: 'Resolved', value: ticketStats.resolved, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' }
        ].map((stat, i) => (
          <div key={i} className={`p-4 rounded-2xl border ${stat.bg} ${stat.border}`}>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* --- Tabs with Notification Badges --- */}
      <div className="flex gap-2 border-b border-slate-200 pb-1">
        {[
          { id: 'overview', label: 'Ticket Oversight', icon: ShieldAlert },
          { id: 'notifications', label: 'Alerts', icon: AlertTriangle, badge: hrAlerts.length + pendingLeaveRequests.length },
          { id: 'users', label: 'User Management', icon: User },
          { id: 'schedules', label: 'Schedules', icon: Calendar }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-indigo-600 border-b-2 border-indigo-600'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <tab.icon size={16} /> {tab.label}
            {tab.badge > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-full animate-pulse">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* --- CONTENT: OVERVIEW --- */}
      {activeTab === 'overview' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="table-container">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-500">Issue Details</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Reported</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tickets.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 cursor-pointer" onClick={() => { setDetailTicket(t); setShowDetailModal(true); }}>
                      <p className="font-semibold text-slate-800 flex items-center gap-2">
                        {t.category}
                        {t.imageUrls?.length > 0 && <Camera size={14} className="text-slate-400" />}
                      </p>
                      <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                         <span className="flex items-center gap-1"><MapPin size={12}/> {t.location}</span>
                         <PriorityBadge priority={t.priority} />
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-6 py-4 text-center text-slate-500">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center gap-2">
                        {t.status !== 'resolved' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); escalateTicket(t.id, t.priority, t.originalPriority); }} 
                            className={`p-2 rounded-lg transition-colors ${
                              t.priority === 'critical' 
                                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                                : 'bg-red-50 text-red-600 hover:bg-red-100'
                            }`} 
                            title={t.priority === 'critical' ? 'Remove Critical (De-escalate)' : 'Escalate to Critical'}
                          >
                            <AlertTriangle size={16} />
                          </button>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); onDeleteTicket(t.id); }} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200" title="Delete Ticket">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- UPDATED USERS TAB (With loading states) --- */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
           <div className="table-container">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 font-semibold text-slate-500">User</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Role</th>
                  {/* Only Managers see Contact column */}
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Contact</th>
                  {/* Only Managers see Status/Actions */}
                  {canManageUsers && <th className="px-6 py-4 font-semibold text-slate-500 text-center">Status</th>}
                  {canManageUsers && <th className="px-6 py-4 font-semibold text-slate-500 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleUsers.map((u) => {
                  // --- SAFETY PATCH: IDENTIFY CURRENT USER ---
                  const isCurrentUser = user && u.id === user.uid;
                  // -------------------------------------------

                  return (
                  <tr key={u.id} className={isCurrentUser ? "bg-indigo-50/30" : ""}>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700">{u.displayName || u.email}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="px-2 py-1 rounded bg-slate-100 text-slate-600 text-xs uppercase font-bold">
                        {u.role || 'staff'}
                      </span>
                    </td>
                    {/* Everyone can see Phone Numbers (Directory) */}
                    <td className="px-6 py-4 text-center">
                      <p className="text-slate-600">{u.phoneNumber || 'N/A'}</p>
                    </td>

                    {/* MANAGERS ONLY: Status & Actions */}
                    {canManageUsers && (
                      <>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${u.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : u.status === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                            {u.status || 'pending'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center flex justify-center gap-2">
                          {actionLoading === u.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                          ) : (
                            <>
                              {/* View Documents Button */}
                              <button
                                onClick={() => {
                                  setSelectedUserDocs(u.documents || {});
                                  setSelectedUserName(u.displayName || u.email);
                                  setShowDocModal(true);
                                }}
                                className="text-indigo-600 hover:bg-indigo-50 p-1.5 rounded" title="View HR Documents"
                              >
                                <FolderOpen size={16} />
                              </button>

                              {!isCurrentUser && (
                                <>
                                  {/* Role Dropdown - Only HR/Admin can change roles */}
                                  <div className="relative inline-block">
                                    <button
                                      onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
                                      disabled={actionLoading === u.id}
                                      className="text-slate-600 hover:bg-slate-50 p-1.5 rounded"
                                      title="Change Role"
                                    >
                                      <User size={16} />
                                    </button>
                                    {openDropdown === u.id && (
                                      <div className="absolute top-12 right-0 w-32 bg-white border border-slate-200 shadow-xl rounded-lg z-10 py-1">
                                        {u.role !== 'staff' && (
                                          <button
                                            onClick={() => updateRole(u.id, 'staff')}
                                            className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50"
                                          >
                                            Staff
                                          </button>
                                        )}
                                        {u.role !== 'maintenance' && (
                                          <button
                                            onClick={() => updateRole(u.id, 'maintenance')}
                                            className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50"
                                          >
                                            Maintenance
                                          </button>
                                        )}
                                        {u.role !== 'admin' && (userData.role === 'admin') && (
                                          <button
                                            onClick={() => updateRole(u.id, 'admin')}
                                            className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 font-bold text-red-600"
                                          >
                                            Admin
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>

                                  {/* Approval/Actions */}
                                  {u.status !== 'approved' && (
                                    <button onClick={() => updateUser(u.id, 'approved')} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded" title="Approve User">
                                      <CheckCircle size={16} />
                                    </button>
                                  )}
                                  {u.status !== 'blocked' && (
                                    <button onClick={() => updateUser(u.id, 'blocked')} className="text-amber-600 hover:bg-indigo-50 p-1.5 rounded" title="Block User">
                                      <Pause size={16} />
                                    </button>
                                  )}
                                  {/* CRITICAL: HR cannot delete HR, only Admin can */}
                                  {(userData.role === 'admin' || (userData.role === 'hr' && u.role !== 'hr')) && (
                                    <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Delete User">
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </>
                    )}
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* --- CONTENT: SCHEDULES --- */}
      {activeTab === 'schedules' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Recurring Maintenance</h3>
            <button onClick={onCreateSchedule} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 flex items-center gap-2">
              <Plus size={16} /> New Schedule
            </button>
          </div>

          <div className="grid gap-4">
            {allSchedules.map((s) => (
              <div key={s.id} className={`bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 justify-between items-start ${!s.isActive && 'opacity-75 bg-slate-50'}`}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-slate-800">{s.category}</h4>
                    {!s.isActive && <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-[10px] font-bold rounded uppercase">Paused</span>}
                  </div>
                  <p className="text-sm text-slate-600 mb-2">{s.description}</p>
                  <div className="flex gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><RefreshCw size={12}/> Every {s.frequencyDays} days</span>
                    <span className="flex items-center gap-1"><MapPin size={12}/> {s.locations?.length} locations</span>
                  </div>
                </div>
                <div className="flex gap-2">
                   <button
                     onClick={async () => { await updateDoc(doc(db, 'scheduled_tasks', s.id), { isActive: !s.isActive }); fetchData(); }}
                     className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600"
                   >
                     {s.isActive ? <Pause size={16} /> : <Play size={16} />}
                   </button>
                   <button
                     onClick={async () => { if(confirm("Delete schedule?")) { await deleteDoc(doc(db, 'scheduled_tasks', s.id)); fetchData(); }}}
                     className="p-2 bg-red-50 hover:bg-red-100 rounded-lg text-red-600"
                   >
                     <Trash2 size={16} />
                   </button>
                </div>
              </div>
            ))}
            {allSchedules.length === 0 && <p className="text-center text-slate-500 py-8">No active schedules.</p>}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <TicketDetailModal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        ticket={detailTicket}
      />

      {/* HR Documents Viewer Modal */}
      {showDocModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
              <div>
                <h3 className="font-bold text-lg text-slate-800">HR Documents</h3>
                <p className="text-sm text-slate-500 mt-1">{selectedUserName}</p>
              </div>
              <button onClick={() => setShowDocModal(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto">
              {Object.entries(selectedUserDocs).length === 0 ? (
                <div className="text-center py-8">
                  <FileText size={48} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-sm">No documents uploaded yet</p>
                </div>
              ) : (
                Object.entries(selectedUserDocs).map(([key, url]) => (
                  <div key={key} className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-100 hover:border-indigo-200 transition-colors">
                    <div className="flex items-center gap-3">
                      <FileText size={20} className="text-slate-500" />
                      <div>
                        <p className="text-sm font-medium text-slate-700 capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-slate-400">Secure HR Document</p>
                      </div>
                    </div>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs bg-indigo-100 text-indigo-700 px-4 py-2 rounded-md hover:bg-indigo-200 transition-colors font-medium"
                    >
                      View / Download
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- CONTENT: NOTIFICATIONS (New Tab) --- */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* HR Compliance Alerts */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <AlertTriangle size={20} className="text-amber-600" />
              HR Compliance Alerts ({hrAlerts.length})
            </h3>

            <div className="space-y-3">
              {hrAlerts.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="text-emerald-400 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">All compliance checks passed! 🎉</p>
                  <p className="text-sm text-slate-400 mt-1">No urgent HR issues to address</p>
                </div>
              ) : (
                hrAlerts.map((alert, i) => {
                  const bgColor = alert.priority === 'critical' ? 'bg-red-50 border-red-200' :
                                 alert.priority === 'warning' ? 'bg-amber-50 border-amber-200' :
                                 'bg-slate-50 border-slate-200';

                  const textColor = alert.priority === 'critical' ? 'text-red-800' :
                                   alert.priority === 'warning' ? 'text-amber-800' :
                                   'text-slate-800';

                  return (
                    <div key={i} className={`p-4 rounded-xl border ${bgColor} ${textColor}`}>
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-full ${alert.priority === 'critical' ? 'bg-red-100' : alert.priority === 'warning' ? 'bg-amber-100' : 'bg-slate-100'}`}>
                          <AlertTriangle size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{alert.msg}</p>
                          <p className="text-xs opacity-75 mt-1">{alert.detail}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Leave Requests (Will show when staff submit leave requests) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              Leave Requests ({pendingLeaveRequests.length})
            </h3>

            <div className="space-y-3">
              {pendingLeaveRequests.length === 0 ? (
                <div className="text-center py-8">
                  <Clock size={48} className="text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-medium">No leave requests pending</p>
                  <p className="text-sm text-slate-400 mt-1">Requests will appear here when staff submit leave applications</p>
                </div>
              ) : (
                pendingLeaveRequests.map((request) => (
                  <div key={request.id} className="p-4 rounded-xl border border-blue-100 bg-blue-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <User size={16} className="text-blue-600" />
                          <span className="font-medium text-blue-800">{request.employeeName}</span>
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
                            {request.daysRequested} days
                          </span>
                        </div>
                        <div className="text-sm text-blue-700 mb-2">
                          <span className="font-medium">From:</span> {request.leaveStart?.toDate?.()?.toLocaleDateString() || request.leaveStart}
                          <span className="mx-2">→</span>
                          <span className="font-medium">To:</span> {request.leaveEnd?.toDate?.()?.toLocaleDateString() || request.leaveEnd}
                        </div>
                        {request.reason && (
                          <div className="text-sm text-blue-600 mb-2">
                            <span className="font-medium">Reason:</span> {request.reason}
                          </div>
                        )}
                        <div className="text-xs text-blue-500">
                          Submitted: {request.submittedAt?.toDate?.()?.toLocaleDateString() || request.submittedAt}
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => processLeaveRequest(request, 'approved')}
                          className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => processLeaveRequest(request, 'rejected')}
                          className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Document Uploads (Recent activity - new docs uploaded) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <FileText size={20} className="text-emerald-600" />
              Recent Document Uploads (0)
            </h3>

            <div className="text-center py-8">
              <UploadCloud size={48} className="text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-medium">No recent document uploads</p>
              <p className="text-sm text-slate-400 mt-1">Staff uploads will be tracked here</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
