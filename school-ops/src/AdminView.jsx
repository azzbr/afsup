import React, { useState, useEffect } from 'react';
import { updateDoc, doc, serverTimestamp, collection, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
  ShieldAlert, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown,
  MapPin, User, FileText, Camera, X, Trash2, Pause, Play, RefreshCw,
  Calendar, Search, Loader2
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

export default function AdminView({ tickets, user, userData, onCreateSchedule, onDeleteTicket }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [allUsers, setAllUsers] = useState([]);
  const [allSchedules, setAllSchedules] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);

  // New state for loading feedback
  const [actionLoading, setActionLoading] = useState(null); // Stores the ID of the user being updated

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const usersDocs = await getDocs(collection(db, 'users'));
      setAllUsers(usersDocs.docs.map(d => ({ id: d.id, ...d.data() })));
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

  const escalateTicket = async (id) => {
    await updateDoc(doc(db, 'maintenance_tickets', id), { priority: 'critical', escalated: true });
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

      {/* --- Tabs --- */}
      <div className="flex gap-2 border-b border-slate-200 pb-1">
        {[
          { id: 'overview', label: 'Ticket Oversight', icon: ShieldAlert },
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
                          <button onClick={(e) => { e.stopPropagation(); escalateTicket(t.id); }} className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Escalate Priority">
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
                  <th className="px-6 py-4 font-semibold text-slate-500">User Email</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Role</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-slate-500 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allUsers.map((u) => {
                  // --- SAFETY PATCH: IDENTIFY CURRENT USER ---
                  const isCurrentUser = user && u.id === user.uid;
                  // -------------------------------------------

                  return (
                  <tr key={u.id} className={isCurrentUser ? "bg-indigo-50/30" : ""}>
                    <td className="px-6 py-4 font-medium text-slate-700 flex items-center gap-1">
                      {u.email}
                      {isCurrentUser && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200">YOU</span>}
                    </td>
                    <td className="px-6 py-4 text-center relative">
                      <button
                        onClick={() => setOpenDropdown(openDropdown === u.id ? null : u.id)}
                        disabled={actionLoading === u.id}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 disabled:opacity-50"
                      >
                        {u.role || 'staff'} <ChevronDown size={12} />
                      </button>
                      {openDropdown === u.id && (
                        <div className="absolute top-12 left-1/2 -translate-x-1/2 w-32 bg-white border border-slate-200 shadow-xl rounded-lg z-10 py-1">
                          {u.role !== 'staff' && (
                            <button
                              onClick={() => updateRole(u.id, 'staff')}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 capitalize"
                            >
                              Staff
                            </button>
                          )}
                          {u.role !== 'maintenance' && (
                            <button
                              onClick={() => updateRole(u.id, 'maintenance')}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 capitalize"
                            >
                              Maintenance
                            </button>
                          )}
                          {u.role !== 'admin' && (
                            <button
                              onClick={() => updateRole(u.id, 'admin')}
                              className="w-full text-left px-4 py-2 text-xs hover:bg-slate-50 capitalize"
                            >
                              Admin
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                        u.status === 'approved' ? 'bg-emerald-50 text-emerald-700' :
                        u.status === 'blocked' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                      }`}>
                        {u.status || 'pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center flex justify-center gap-2">
                      {actionLoading === u.id ? (
                        <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                      ) : (
                        <>
                          {!isCurrentUser && (
                            <>
                              {u.status !== 'approved' && (
                                <button onClick={() => updateUser(u.id, 'approved')} className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded" title="Approve User">
                                  <CheckCircle size={16} />
                                </button>
                              )}
                              {u.status !== 'blocked' && (
                                <button onClick={() => updateUser(u.id, 'blocked')} className="text-amber-600 hover:bg-amber-50 p-1.5 rounded" title="Block User">
                                  <Pause size={16} />
                                </button>
                              )}
                              <button onClick={() => deleteUser(u.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded" title="Delete User">
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
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

    </div>
  );
}
