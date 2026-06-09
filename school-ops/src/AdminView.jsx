import React, { useState, useMemo } from 'react';
import { updateDoc, doc, serverTimestamp, deleteDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import { actorFrom, can, assignableRoles } from './permissions';
import { resolveBalances, debitLeave } from './hr/leave';
import { useUsers } from './data/useUsers';
import { useScheduledTasks } from './data/useScheduledTasks';
import { useLeaveRequests } from './data/useLeaveRequests';
import { auditUpdate } from './data/audit';
import { getTimeOpen, computeScheduleDue } from './maintenance/ticketUtils';
import {
  ShieldAlert, AlertTriangle, CheckCircle, Clock, Plus, ChevronDown,
  MapPin, User, FileText, Camera, X, Trash2, Pause, Play, RefreshCw,
  Calendar, Search, Loader2, FolderOpen, UploadCloud, Download, Filter,
  MessageSquare, Timer, ShieldOff, UserCheck, Ban
} from 'lucide-react';

// --- Sub-components (Badges) ---

const StatusBadge = ({ status }) => {
  const styles = {
    open: "bg-red-50 text-red-700 border-red-100",
    in_progress: "bg-amber-50 text-amber-700 border-amber-100",
    resolved: "bg-emerald-50 text-emerald-700 border-emerald-100",
    duplicate: "bg-slate-100 text-slate-500 border-slate-200"
  };
  const labels = { open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', duplicate: 'Duplicate' };

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

// ============================================================================
// HR COMPLIANCE ALERTS (pure — module-scope)
//
// Operates on users where Timestamp fields have already been normalized to
// JS Dates by useUsers().convertUser.
// ============================================================================

function calculateHRAlerts(users) {
  const now = new Date();
  const threeMonthsFromNow = new Date(); threeMonthsFromNow.setMonth(now.getMonth() + 3);
  const oneMonthFromNow = new Date(); oneMonthFromNow.setMonth(now.getMonth() + 1);

  const alerts = [];

  users.forEach(u => {
    // 1. CPR Expiry Check
    if (u.cprExpiry instanceof Date) {
      if (u.cprExpiry < now) {
        alerts.push({
          type: 'expired', priority: 'critical',
          msg: `CPR EXPIRED: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: 'Immediate action required - suspend access if needed',
        });
      } else if (u.cprExpiry < threeMonthsFromNow) {
        alerts.push({
          type: 'warning', priority: 'warning',
          msg: `CPR Expiring Soon: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: `Expires: ${u.cprExpiry.toLocaleDateString()}`,
        });
      }
    }

    // 2. VISA Expiry Check (non-Bahraini only)
    if (u.nationality !== 'Bahraini' && u.residencePermitExpiry instanceof Date) {
      if (u.residencePermitExpiry < now) {
        alerts.push({
          type: 'expired', priority: 'critical',
          msg: `VISA EXPIRED: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: 'LMRA violations possible - legal action needed',
        });
      } else if (u.residencePermitExpiry < oneMonthFromNow) {
        alerts.push({
          type: 'warning', priority: 'warning',
          msg: `Visa Expiring: ${u.displayName || u.email}`,
          employee: u.displayName,
          detail: `RP expires: ${u.residencePermitExpiry.toLocaleDateString()}`,
        });
      }
    }

    // 3. Bank IBAN Missing/Incomplete
    if (!u.iban || !u.iban.startsWith('BH')) {
      alerts.push({
        type: 'incomplete', priority: 'info',
        msg: `Missing/Invalid IBAN: ${u.displayName || u.email}`,
        employee: u.displayName,
        detail: 'WPS compliance requires complete IBAN for salary payments',
      });
    }

    // 4. Arabic Name Missing (GOSI Requirement)
    if (!u.arabicName && u.nationality === 'Bahraini') {
      alerts.push({
        type: 'incomplete', priority: 'info',
        msg: `Arabic Name Missing: ${u.displayName || u.email}`,
        employee: u.displayName,
        detail: 'Required for GOSI & official Ministry documents',
      });
    }
  });

  const priorityOrder = { critical: 3, warning: 2, info: 1 };
  return alerts.sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority]);
}

// --- Main Admin View Component ---

export default function AdminView({
  tickets = [],
  user,
  userData,
  onCreateSchedule,
  onDeleteTicket,
  initialTab
}) {
  const [activeTab, setActiveTab] = useState(initialTab || 'overview');
  const [openDropdown, setOpenDropdown] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailTicket, setDetailTicket] = useState(null);
  const [showDocModal, setShowDocModal] = useState(false);
  const [selectedUserDocs, setSelectedUserDocs] = useState({});
  const [selectedUserName, setSelectedUserName] = useState('');
  const [actionLoading, setActionLoading] = useState(null); // uid of user being updated

  // Filter + batch action state
  const [ticketFilter, setTicketFilter] = useState('all');
  const [selectedTickets, setSelectedTickets] = useState([]);
  const [quickNote, setQuickNote] = useState({});

  // Live data — subscriptions auto-update after mutations.
  const actor = actorFrom(userData);
  const { data: allUsers = [] } = useUsers(Boolean(userData));
  const { data: allSchedules = [] } = useScheduledTasks(Boolean(userData));
  const { data: pendingLeaveRequests = [] } = useLeaveRequests(actor, 'pending');

  // Filter users via the permissions module. Add `id` alias for legacy UI.
  const visibleUsers = useMemo(() => {
    return allUsers
      .filter(u => can(actor, 'user.view.profile', {
        type: 'user',
        data: { uid: u.uid, role: u.role || 'staff' },
      }))
      .map(u => ({ ...u, id: u.uid }));
  }, [allUsers, actor]);

  const hrAlerts = useMemo(() => calculateHRAlerts(visibleUsers), [visibleUsers]);

  // Mutations only need to read this once. Kept for back-compat with UI checks.
  const canManageUsers = can(actor, 'user.invite');

  // No-op fetchData — kept to minimize churn in mutation handlers below.
  // Subscriptions push fresh data automatically.
  const fetchData = () => {};

  // Tickets merged as duplicates are hidden from admin oversight entirely —
  // excluded from both the stat cards and the table below.
  const visibleTickets = tickets.filter(t => t.status !== 'duplicate');

  const ticketStats = visibleTickets.reduce((a, t) => {
    if (t.priority === 'critical' && t.status !== 'resolved') a.critical++;
    if (t.status === 'open') a.backlog++;
    if (t.status === 'in_progress') a.inProgress++;
    if (t.status === 'resolved') a.resolved++;
    return a;
  }, { critical: 0, backlog: 0, inProgress: 0, resolved: 0 });

  // --- FILTERED TICKETS based on stat card selection ---
  const filteredTickets = visibleTickets.filter(t => {
    if (ticketFilter === 'all') return true;
    if (ticketFilter === 'critical') return t.priority === 'critical' && t.status !== 'resolved';
    if (ticketFilter === 'open') return t.status === 'open';
    if (ticketFilter === 'in_progress') return t.status === 'in_progress';
    if (ticketFilter === 'resolved') return t.status === 'resolved';
    return true;
  });

  // --- EXPORT TO CSV ---
  const exportToCSV = () => {
    const dataToExport = ticketFilter === 'all' ? visibleTickets : filteredTickets;
    const headers = ['Category', 'Location', 'Priority', 'Status', 'Reported', 'Description', 'Admin Notes'];
    const rows = dataToExport.map(t => [
      t.category || '',
      t.location || '',
      t.priority || 'medium',
      t.status || 'open',
      t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '',
      (t.description || '').replace(/"/g, '""'),
      (t.adminNotes || '').replace(/"/g, '""')
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tickets_export_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // --- QUICK NOTE SAVE ---
  const saveQuickNote = async (ticketId, note) => {
    try {
      await updateDoc(doc(db, 'maintenance_tickets', ticketId), {
        adminNotes: note,
        lastNoteBy: userData?.email || user?.uid,
        lastNoteAt: serverTimestamp(),
        ...auditUpdate(user.uid)
      });
      setQuickNote(prev => ({ ...prev, [ticketId]: '' }));
    } catch (e) {
      console.error("Note save error:", e);
      alert("Failed to save note");
    }
  };

  // --- BATCH ACTIONS ---
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedTickets(filteredTickets.filter(t => t.status !== 'resolved').map(t => t.id));
    } else {
      setSelectedTickets([]);
    }
  };

  const handleSelectTicket = (ticketId, checked) => {
    if (checked) {
      setSelectedTickets(prev => [...prev, ticketId]);
    } else {
      setSelectedTickets(prev => prev.filter(id => id !== ticketId));
    }
  };

  const batchMarkResolved = async () => {
    if (selectedTickets.length === 0) return alert("No tickets selected");
    if (!confirm(`Mark ${selectedTickets.length} tickets as resolved?`)) return;
    
    try {
      for (const id of selectedTickets) {
        await updateDoc(doc(db, 'maintenance_tickets', id), {
          status: 'resolved',
          resolvedAt: serverTimestamp(),
          resolvedBy: userData?.displayName || userData?.email || 'Admin',
          resolvedByUid: user.uid,
          ...auditUpdate(user.uid)
        });
      }
      setSelectedTickets([]);
      alert(`${selectedTickets.length} tickets marked as resolved`);
    } catch (e) {
      console.error(e);
      alert("Error updating tickets");
    }
  };

  const batchDelete = async () => {
    if (selectedTickets.length === 0) return alert("No tickets selected");
    if (!confirm(`DELETE ${selectedTickets.length} tickets permanently?`)) return;
    
    try {
      for (const id of selectedTickets) {
        await deleteDoc(doc(db, 'maintenance_tickets', id));
      }
      setSelectedTickets([]);
      alert(`${selectedTickets.length} tickets deleted`);
    } catch (e) {
      console.error(e);
      alert("Error deleting tickets");
    }
  };

  // Status, role, and delete now go through Cloud Functions. They:
  //   - validate caller permission server-side (defense-in-depth)
  //   - write audit_log atomically
  //   - delete the Firebase Auth user too on delete (so re-invite works)
  //
  // Errors come back as HttpsError with human-readable messages — surface
  // them so the user knows *why* an action failed, not just "permission denied".

  const updateUser = async (userId, newStatus) => {
    setActionLoading(userId);
    try {
      const call = httpsCallable(functions, 'updateUserStatus');
      await call({ uid: userId, status: newStatus });
      // No refetch — useUsers subscription pushes the change in automatically.
    } catch (error) {
      console.error("Status change failed:", error);
      alert(`Could not change status: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const updateRole = async (userId, newRole) => {
    setActionLoading(userId);
    try {
      const call = httpsCallable(functions, 'updateUserRole');
      await call({ uid: userId, role: newRole });
      setOpenDropdown(null);
    } catch (error) {
      console.error("Role change failed:", error);
      alert(`Could not change role: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  // Modal-driven delete. The confirmation lives in a real modal so the user
  // sees what they're about to do (vs. an OS confirm() popup).
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, displayName, email } | null

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(deleteTarget.id);
    try {
      const call = httpsCallable(functions, 'deleteUser');
      await call({ uid: deleteTarget.id });
      setDeleteTarget(null);
    } catch (error) {
      console.error("Delete failed:", error);
      alert(`Could not delete user: ${error.message}`);
    } finally {
      setActionLoading(null);
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

      // 3. If approved, debit the per-type balance (Phase 2.7).
      //    Falls back to "annual" for legacy requests with no leaveType.
      if (status === 'approved') {
        const leaveType = request.leaveType || 'annual';
        const days = request.daysRequested || 0;
        const userRef = doc(db, 'users', request.userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists() && leaveType !== 'unpaid' && leaveType !== 'study') {
          const currentBalances = resolveBalances(userDoc.data());
          const newBalances = debitLeave(currentBalances, leaveType, days);
          const updates = {
            leaveBalances: newBalances,
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          };
          if (leaveType === 'annual') {
            updates.annualLeaveBalance = Math.max(0, newBalances.annual.entitled - newBalances.annual.used);
          } else if (leaveType === 'sick') {
            updates.sickDaysUsed = newBalances.sick.used;
          }
          await updateDoc(userRef, updates);
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
          escalated: false,
          ...auditUpdate(user.uid)
        });
      } else {
        // Escalate: Save original and set to critical
        await updateDoc(doc(db, 'maintenance_tickets', ticketId), {
          priority: 'critical',
          originalPriority: currentPriority, // Save original for reverting
          escalated: true,
          ...auditUpdate(user.uid)
        });
      }
    } catch (e) {
      console.error("Escalation error:", e);
      alert("Failed to update priority");
    }
  };

  return (
    <div className="space-y-6">

      {/* --- Admin Stats Cards (Clickable Filters) --- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Critical Issues', value: ticketStats.critical, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', filter: 'critical' },
          { label: 'Open Backlog', value: ticketStats.backlog, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', filter: 'open' },
          { label: 'In Progress', value: ticketStats.inProgress, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', filter: 'in_progress' },
          { label: 'Resolved', value: ticketStats.resolved, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', filter: 'resolved' }
        ].map((stat, i) => (
          <button 
            key={i} 
            onClick={() => setTicketFilter(ticketFilter === stat.filter ? 'all' : stat.filter)}
            className={`p-4 rounded-2xl border text-left transition-all ${stat.bg} ${stat.border} ${ticketFilter === stat.filter ? 'ring-2 ring-offset-2 ring-indigo-500 scale-105' : 'hover:scale-102'}`}
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{stat.label}</p>
            {ticketFilter === stat.filter && <p className="text-[10px] text-indigo-600 mt-1">✓ Filtered</p>}
          </button>
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
        <div className="space-y-4">
          {/* Toolbar: Batch Actions + Export */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="flex items-center gap-3">
              {ticketFilter !== 'all' && (
                <button 
                  onClick={() => setTicketFilter('all')} 
                  className="text-xs bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-300 flex items-center gap-1"
                >
                  <X size={12} /> Clear Filter
                </button>
              )}
              <span className="text-sm text-slate-500">
                Showing <strong>{filteredTickets.length}</strong> of {visibleTickets.length} tickets
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              {/* Batch Actions (when tickets selected) */}
              {selectedTickets.length > 0 && (
                <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
                  <span className="text-xs text-indigo-700 font-medium">{selectedTickets.length} selected</span>
                  <button onClick={batchMarkResolved} className="text-xs bg-emerald-600 text-white px-2 py-1 rounded hover:bg-emerald-700">
                    ✓ Resolve All
                  </button>
                  <button onClick={batchDelete} className="text-xs bg-red-600 text-white px-2 py-1 rounded hover:bg-red-700">
                    Delete All
                  </button>
                  <button onClick={() => setSelectedTickets([])} className="text-xs text-slate-500 hover:text-slate-700">
                    <X size={14} />
                  </button>
                </div>
              )}
              
              {/* Export Button */}
              <button 
                onClick={exportToCSV} 
                className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-50"
              >
                <Download size={14} /> Export CSV
              </button>
            </div>
          </div>

          {/* Tickets Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="table-container">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-3 py-4 w-10">
                      <input 
                        type="checkbox" 
                        checked={selectedTickets.length === filteredTickets.filter(t => t.status !== 'resolved').length && selectedTickets.length > 0}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                    </th>
                    <th className="px-4 py-4 font-semibold text-slate-500">Issue Details</th>
                    <th className="px-4 py-4 font-semibold text-slate-500 text-center">Status</th>
                    <th className="px-4 py-4 font-semibold text-slate-500 text-center">
                      <span className="flex items-center justify-center gap-1"><Timer size={14}/> Open</span>
                    </th>
                    <th className="px-4 py-4 font-semibold text-slate-500">Quick Note</th>
                    <th className="px-4 py-4 font-semibold text-slate-500 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTickets.map((t) => {
                    const timeOpen = t.status !== 'resolved'
                      ? getTimeOpen(t.createdAt instanceof Date ? t.createdAt : null)
                      : null;
                    return (
                      <tr key={t.id} className={`hover:bg-slate-50/50 transition-colors ${selectedTickets.includes(t.id) ? 'bg-indigo-50/30' : ''}`}>
                        <td className="px-3 py-4">
                          {t.status !== 'resolved' && (
                            <input 
                              type="checkbox" 
                              checked={selectedTickets.includes(t.id)}
                              onChange={(e) => handleSelectTicket(t.id, e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300"
                            />
                          )}
                        </td>
                        <td className="px-4 py-4 cursor-pointer" onClick={() => { setDetailTicket(t); setShowDetailModal(true); }}>
                          <p className="font-semibold text-slate-800 flex items-center gap-2">
                            {t.category}
                            {t.imageUrls?.length > 0 && <Camera size={14} className="text-slate-400" />}
                          </p>
                          <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1"><MapPin size={12}/> {t.location}</span>
                            <PriorityBadge priority={t.priority} />
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                            <User size={12}/> by {t.reporterName || 'Anonymous'}
                          </p>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <StatusBadge status={t.status} />
                        </td>
                        <td className="px-4 py-4 text-center">
                          {timeOpen ? (
                            <span className={`px-2 py-1 rounded-lg text-xs font-medium ${timeOpen.color}`}>
                              {timeOpen.urgent && '⚠️ '}{timeOpen.text}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.status !== 'resolved' ? (
                            <div className="flex items-center gap-1">
                              <input 
                                type="text"
                                placeholder={t.adminNotes || "Add note..."}
                                value={quickNote[t.id] || ''}
                                onChange={(e) => setQuickNote(prev => ({ ...prev, [t.id]: e.target.value }))}
                                className="w-28 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-indigo-400"
                                onClick={(e) => e.stopPropagation()}
                              />
                              {quickNote[t.id] && (
                                <button 
                                  onClick={(e) => { e.stopPropagation(); saveQuickNote(t.id, quickNote[t.id]); }}
                                  className="p-1 bg-indigo-100 text-indigo-600 rounded hover:bg-indigo-200"
                                >
                                  <CheckCircle size={12} />
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic">{t.adminNotes || '—'}</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center">
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
                    );
                  })}
                  {filteredTickets.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-500">
                        No tickets match the current filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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

                              {!isCurrentUser && (() => {
                                // All gating goes through can() / assignableRoles().
                                // If the user can't perform an action, the button
                                // doesn't render — no cryptic permission errors.
                                const canEditRole = can(actor, 'user.edit.role', {
                                  type: 'user',
                                  data: { uid: u.id, role: u.role || 'staff' },
                                });
                                const canEditStatus = can(actor, 'user.edit.status', {
                                  type: 'user',
                                  data: { uid: u.id, role: u.role || 'staff' },
                                });
                                const canDelete = can(actor, 'user.delete');
                                const rolesIMayAssign = assignableRoles(actor);

                                return (
                                  <>
                                    {/* Role Dropdown */}
                                    {canEditRole && rolesIMayAssign.length > 0 && (
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
                                          <div className="absolute top-12 right-0 w-36 bg-white border border-slate-200 shadow-xl rounded-lg z-10 py-1">
                                            {rolesIMayAssign
                                              .filter(r => r !== u.role)
                                              .map(r => (
                                                <button
                                                  key={r}
                                                  onClick={() => updateRole(u.id, r)}
                                                  className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 capitalize ${r === 'admin' ? 'font-bold text-red-600' : ''}`}
                                                >
                                                  {r}
                                                </button>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Status actions — bi-directional */}
                                    {canEditStatus && u.status !== 'approved' && (
                                      <button
                                        onClick={() => updateUser(u.id, 'approved')}
                                        className="text-emerald-600 hover:bg-emerald-50 p-1.5 rounded"
                                        title={u.status === 'blocked' ? 'Unblock User' : u.status === 'suspended' ? 'Reinstate User' : 'Approve User'}
                                      >
                                        {u.status === 'blocked' || u.status === 'suspended' ? <UserCheck size={16} /> : <CheckCircle size={16} />}
                                      </button>
                                    )}
                                    {canEditStatus && u.status === 'approved' && (
                                      <button
                                        onClick={() => updateUser(u.id, 'suspended')}
                                        className="text-amber-600 hover:bg-amber-50 p-1.5 rounded"
                                        title="Suspend User (temporary, can be undone)"
                                      >
                                        <Pause size={16} />
                                      </button>
                                    )}
                                    {canEditStatus && u.status !== 'blocked' && (
                                      <button
                                        onClick={() => updateUser(u.id, 'blocked')}
                                        className="text-orange-600 hover:bg-orange-50 p-1.5 rounded"
                                        title="Block User (long-term, can be undone)"
                                      >
                                        <Ban size={16} />
                                      </button>
                                    )}

                                    {/* Delete — opens confirmation modal */}
                                    {canDelete && (
                                      <button
                                        onClick={() => setDeleteTarget({
                                          id: u.id,
                                          displayName: u.displayName || u.email,
                                          email: u.email,
                                          role: u.role,
                                        })}
                                        className="text-red-500 hover:bg-red-50 p-1.5 rounded"
                                        title="Delete User"
                                      >
                                        <Trash2 size={16} />
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
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
                  <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1"><RefreshCw size={12}/> Every {s.frequencyDays} days</span>
                    <span className="flex items-center gap-1"><MapPin size={12}/> {s.locations?.length} locations</span>
                    {(() => {
                      // lastRun/nextRun arrive as JS Dates via useScheduledTasks;
                      // computeScheduleDue also handles legacy ISO-string startDate.
                      const last = s.lastRun instanceof Date ? s.lastRun : null;
                      const due = computeScheduleDue(s);
                      const pastDue = due ? due.getTime() <= Date.now() : false;
                      return (
                        <>
                          <span className="flex items-center gap-1" title={last?.toLocaleString() || 'Never run'}>
                            <Clock size={12}/> Last: {last ? last.toLocaleDateString() : 'never'}
                          </span>
                          {s.isActive && (
                            <span className={`flex items-center gap-1 ${pastDue ? 'text-red-600 font-semibold' : 'text-indigo-600'}`} title={due?.toLocaleString() || 'Pending first run'}>
                              <Clock size={12}/> {pastDue ? 'Due now' : `Next: ${due ? due.toLocaleDateString() : 'pending'}`}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex gap-2">
                   <button
                     onClick={async () => { await updateDoc(doc(db, 'scheduled_tasks', s.id), { isActive: !s.isActive, ...auditUpdate(user.uid) }); fetchData(); }}
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

      {/* Delete User Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="text-red-600" size={22} />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900">Delete this user?</h3>
                <p className="text-xs text-slate-500 mt-0.5">This cannot be undone.</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 text-sm">
              <p className="font-medium text-slate-900">{deleteTarget.displayName}</p>
              <p className="text-slate-500 mt-0.5">{deleteTarget.email}</p>
              <p className="text-xs text-slate-400 mt-2 capitalize">Role: {deleteTarget.role}</p>
            </div>

            <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-5">
              <p className="text-xs font-bold text-red-800 uppercase mb-1">What will be removed</p>
              <ul className="text-xs text-red-700 space-y-1">
                <li>• HR profile and all associated data</li>
                <li>• Firebase Auth login account</li>
                <li>• An audit_log entry is written for forensic record</li>
              </ul>
              <p className="text-xs text-red-700 mt-2">
                After deletion, this email can be invited again as a fresh user.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={actionLoading === deleteTarget.id}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={actionLoading === deleteTarget.id}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {actionLoading === deleteTarget.id && <Loader2 className="w-4 h-4 animate-spin" />}
                {actionLoading === deleteTarget.id ? 'Deleting…' : 'Delete user'}
              </button>
            </div>
          </div>
        </div>
      )}

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
