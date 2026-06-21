import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { functions } from '../firebase';
import { actorFrom, can, canSeeRoleView } from '../permissions';
import { useUsers, USERS_KEY } from '../data/useUsers';
import { useLeaveRequests, LEAVE_REQUESTS_KEY } from '../data/useLeaveRequests';
import { complianceAlertsAll } from '../hr/compliance';
import HRDirectory from './HRDirectory';
import EmployeeDetailView from './EmployeeDetailView';
import InviteEmployeeModal from './InviteEmployeeModal';
import HRReports from './HRReports';
import {
  Users, AlertTriangle, Calendar, FileText, Bell, Settings,
  TrendingUp, Clock, CheckCircle, UserPlus, Briefcase, Shield,
  ChevronRight, Search, Filter, BarChart3, PieChart, Activity,
  Building2, Globe, CreditCard, Loader2, X, RefreshCw
} from 'lucide-react';

// ============================================================================
// QUICK STAT CARD COMPONENT
// ============================================================================

const StatCard = ({ icon: Icon, label, value, trend, color = 'indigo', onClick }) => {
  const colorStyles = {
    indigo: 'from-indigo-500 to-purple-600',
    emerald: 'from-emerald-500 to-teal-600',
    amber: 'from-amber-500 to-orange-600',
    red: 'from-red-500 to-rose-600',
    slate: 'from-slate-600 to-slate-700'
  };
  
  return (
    <div
      onClick={onClick}
      className={`bg-gradient-to-br ${colorStyles[color]} rounded-2xl p-5 text-white cursor-pointer hover:shadow-lg hover:scale-[1.02] transition-all duration-200`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-white/70 text-sm font-medium mb-1">{label}</p>
          <p className="text-3xl font-bold">{value}</p>
          {trend && (
            <p className="text-white/60 text-xs mt-2 flex items-center gap-1">
              <TrendingUp size={12} />
              {trend}
            </p>
          )}
        </div>
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPLIANCE ALERT BANNER
// ============================================================================

const ComplianceAlertBanner = ({ alerts, onViewAll }) => {
  if (alerts.length === 0) return null;
  
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const warningCount = alerts.filter(a => a.severity === 'warning').length;
  
  return (
    <div className="bg-gradient-to-r from-red-50 via-amber-50 to-red-50 border border-red-200 rounded-2xl p-5 mb-6">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center shrink-0">
            <AlertTriangle size={24} className="text-red-600" />
          </div>
          <div>
            <h3 className="font-bold text-red-800 text-lg">HR Compliance Alerts</h3>
            <p className="text-red-600 text-sm mt-1">
              {criticalCount > 0 && <span className="font-bold">{criticalCount} critical</span>}
              {criticalCount > 0 && warningCount > 0 && ' and '}
              {warningCount > 0 && <span>{warningCount} warnings</span>}
              {' '}require your attention
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {alerts.slice(0, 3).map((alert, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded-full ${
                    alert.severity === 'critical'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {alert.message}
                </span>
              ))}
              {alerts.length > 3 && (
                <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                  +{alerts.length - 3} more
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onViewAll}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          View All
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// PENDING APPROVALS WIDGET
// ============================================================================

const PendingApprovalsWidget = ({ users, onApprove, onViewUser, canApprove }) => {
  const pendingUsers = users.filter(u => u.status === 'pending');
  
  if (pendingUsers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
            <CheckCircle size={20} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Pending Approvals</h3>
            <p className="text-sm text-slate-500">User registration requests</p>
          </div>
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 text-center">
          <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
          <p className="font-medium text-emerald-700">All caught up!</p>
          <p className="text-sm text-emerald-600">No pending registrations</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Clock size={20} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Pending Approvals</h3>
            <p className="text-sm text-slate-500">{pendingUsers.length} awaiting review</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {pendingUsers.map(user => {
          const initials = `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase() || 'U';
          return (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 bg-amber-50 border border-amber-100 rounded-xl"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-200 flex items-center justify-center text-amber-800 font-bold text-sm">
                  {initials}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">
                    {user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'New User'}
                  </p>
                  <p className="text-sm text-slate-500">{user.email}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onViewUser(user)}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-medium hover:bg-slate-50 transition-colors"
                >
                  View
                </button>
                {canApprove(user) && (
                  <button
                    onClick={() => onApprove(user)}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Approve
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// LEAVE REQUESTS WIDGET
// ============================================================================

const LeaveRequestsWidget = ({ requests, onApprove, onReject }) => {
  if (requests.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Calendar size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Leave Requests</h3>
            <p className="text-sm text-slate-500">Employee time-off requests</p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-6 text-center">
          <Calendar size={40} className="text-blue-400 mx-auto mb-3" />
          <p className="font-medium text-blue-700">No pending requests</p>
          <p className="text-sm text-blue-600">Leave requests will appear here</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Calendar size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800">Leave Requests</h3>
            <p className="text-sm text-slate-500">{requests.length} pending</p>
          </div>
        </div>
      </div>
      
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {requests.map(request => (
          <div
            key={request.id}
            className="p-4 bg-blue-50 border border-blue-100 rounded-xl"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-slate-800">{request.employeeName}</p>
                <p className="text-sm text-blue-700">
                  {request.daysRequested} days • {request.leaveStart?.toLocaleDateString()} - {request.leaveEnd?.toLocaleDateString()}
                </p>
              </div>
              <span className="px-2 py-0.5 bg-blue-200 text-blue-800 rounded text-xs font-bold">
                {request.daysRequested} days
              </span>
            </div>
            {request.reason && (
              <p className="text-sm text-slate-600 mb-3 italic">"{request.reason}"</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(request)}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
              >
                Approve
              </button>
              <button
                onClick={() => onReject(request)}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ============================================================================
// NATIONALITY BREAKDOWN CHART
// ============================================================================

const NationalityBreakdown = ({ users }) => {
  const breakdown = users.reduce((acc, user) => {
    const nat = user.nationality || 'Unknown';
    acc[nat] = (acc[nat] || 0) + 1;
    return acc;
  }, {});
  
  const sorted = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  const colors = ['bg-indigo-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-500'];
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
          <Globe size={20} className="text-indigo-600" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Workforce Diversity</h3>
          <p className="text-sm text-slate-500">By nationality</p>
        </div>
      </div>
      
      <div className="space-y-3">
        {sorted.map(([nat, count], i) => {
          const percentage = Math.round((count / users.length) * 100);
          return (
            <div key={nat}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-slate-700">{nat}</span>
                <span className="text-slate-500">{count} ({percentage}%)</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors[i % colors.length]} rounded-full transition-all duration-500`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================================
// BIRTHDAYS + ANNIVERSARIES WIDGET
//
// Surfaces upcoming employee birthdays and work anniversaries on the HR
// dashboard. Looks ahead 30 days. Pure JSX — no Firestore calls.
// ============================================================================

function nextOccurrence(date, fromDate = new Date()) {
  if (!(date instanceof Date)) return null;
  const next = new Date(fromDate.getFullYear(), date.getMonth(), date.getDate());
  if (next < new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate())) {
    next.setFullYear(fromDate.getFullYear() + 1);
  }
  return next;
}

function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

const BirthdaysAnniversariesWidget = ({ employees }) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today); horizon.setDate(today.getDate() + 30);

  const items = [];
  employees.forEach(u => {
    const name = u.displayName || u.email;

    if (u.dateOfBirth instanceof Date) {
      const next = nextOccurrence(u.dateOfBirth, today);
      if (next && next >= today && next <= horizon) {
        items.push({
          kind: 'birthday',
          name,
          date: next,
          daysAway: daysBetween(today, next),
          detail: 'Birthday',
        });
      }
    }

    if (u.dateOfJoining instanceof Date) {
      const next = nextOccurrence(u.dateOfJoining, today);
      if (next && next >= today && next <= horizon) {
        const years = next.getFullYear() - u.dateOfJoining.getFullYear();
        if (years > 0) {
          items.push({
            kind: 'anniversary',
            name,
            date: next,
            daysAway: daysBetween(today, next),
            detail: `${years}-year work anniversary`,
            milestone: [1, 3, 5, 10, 15, 20].includes(years),
          });
        }
      }
    }
  });

  items.sort((a, b) => a.daysAway - b.daysAway);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
          <Calendar size={20} className="text-pink-600" />
        </div>
        <div>
          <h3 className="font-bold text-slate-800">Upcoming (next 30 days)</h3>
          <p className="text-sm text-slate-500">Birthdays + work anniversaries</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-5 text-center">
          <p className="text-sm text-slate-500">Nothing in the next 30 days.</p>
        </div>
      ) : (
        <ul className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((it, i) => (
            <li
              key={i}
              className={`flex items-center justify-between p-3 rounded-xl border ${
                it.kind === 'birthday' ? 'bg-pink-50 border-pink-100' : 'bg-amber-50 border-amber-100'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 truncate">{it.name}</p>
                <p className="text-xs text-slate-500">
                  {it.detail}{it.milestone && ' 🎉'}
                </p>
              </div>
              <div className="text-right shrink-0 ml-2">
                <p className="text-xs font-bold text-slate-700">
                  {it.daysAway === 0 ? 'Today' : `in ${it.daysAway}d`}
                </p>
                <p className="text-[10px] text-slate-400">
                  {it.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ============================================================================
// MAIN HR SYSTEM COMPONENT
// ============================================================================

export default function HRSystem({ user, userData, initialView = 'dashboard', initialEmployeeUid = null }) {
  const actor = actorFrom(userData);
  // HR privacy lockdown (Phase 2.9.1): the HR module proper (Dashboard +
  // Reports) is people data — hr and Head Admin only. Other actors reach
  // this component via /staff-directory and /employees/:uid and get the
  // directory/employee views only.
  const canSeeHRModule = canSeeRoleView(actor, 'hr');

  const [activeView, setActiveView] = useState(
    !canSeeHRModule && (initialView === 'dashboard' || initialView === 'reports')
      ? 'directory'
      : initialView
  ); // 'dashboard', 'directory', 'reports', 'employee'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Live data from Firestore — subscriptions auto-update after mutations.
  const { data: allUsers = [], isLoading: usersLoading } = useUsers(actor, Boolean(userData));
  // Pending-leave subscription only for actors who may see all leave —
  // passing a non-HR actor would fall back to an own-requests subscription.
  const { data: pendingLeaveRaw = [], isLoading: leaveLoading } =
    useLeaveRequests(can(actor, 'leave.view.all') ? actor : null, 'pending');

  const loading = usersLoading || leaveLoading;

  // Filter by what the current actor is allowed to see (replaces hand-rolled
  // role check). Adds an `id` alias since most existing UI uses `e.id`.
  const employees = useMemo(() => {
    return allUsers
      .filter(u => can(actor, 'user.view.profile', {
        type: 'user',
        data: { uid: u.uid, role: u.role || 'staff' },
      }))
      .map(u => ({ ...u, id: u.uid }));
  }, [allUsers, actor]);

  // Pending leave requests sorted by submission time, newest first.
  const leaveRequests = useMemo(() => {
    return [...pendingLeaveRaw].sort((a, b) => {
      const at = a.submittedAt instanceof Date ? a.submittedAt.getTime() : 0;
      const bt = b.submittedAt instanceof Date ? b.submittedAt.getTime() : 0;
      return bt - at;
    });
  }, [pendingLeaveRaw]);

  // Shared compliance module (src/hr/compliance.ts) — same thresholds as the
  // Cloud Function scan, sorted critical-first. HR compliance is people
  // data, so it is not computed for actors outside the HR module.
  const complianceAlerts = useMemo(
    () => (canSeeHRModule ? complianceAlertsAll(employees) : []),
    [employees, canSeeHRModule]
  );

  // When opened via /employees/:uid, auto-select that employee once loaded.
  // setState in effect is intentional here: we're syncing UI state to a route
  // param whose target appears asynchronously via the live users subscription.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional: sync UI to an async route param */
  useEffect(() => {
    if (!initialEmployeeUid || employees.length === 0) return;
    const match = employees.find(e => e.id === initialEmployeeUid || e.uid === initialEmployeeUid);
    if (match) {
      setSelectedEmployee(match);
      setActiveView('employee');
    }
  }, [initialEmployeeUid, employees]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Stats calculations
  const stats = {
    total: employees.length,
    active: employees.filter(e => e.status === 'approved').length,
    pending: employees.filter(e => e.status === 'pending').length,
    bahraini: employees.filter(e => e.nationality === 'Bahraini').length,
    expat: employees.filter(e => e.nationality !== 'Bahraini').length,
    alerts: complianceAlerts.filter(a => a.severity === 'critical').length
  };
  
  // Handlers
  const handleEmployeeSelect = (employee) => {
    setSelectedEmployee(employee);
    setActiveView('employee');
  };
  
  const handleBackToDirectory = () => {
    setSelectedEmployee(null);
    setActiveView('directory');
  };

  // refetchType 'none': the onSnapshot subscriptions push fresh data; a real
  // refetch would run the stub queryFn and clobber the cache with [].
  const invalidateHRData = () => {
    queryClient.invalidateQueries({ queryKey: USERS_KEY, refetchType: 'none' });
    queryClient.invalidateQueries({ queryKey: LEAVE_REQUESTS_KEY, refetchType: 'none' });
  };

  const handleRefresh = invalidateHRData;

  // User approval goes through the updateUserStatus Cloud Function so the
  // permission check, audit_log entry, and status write happen server-side.
  const handleQuickApprove = async (pendingUser) => {
    const targetId = pendingUser.uid || pendingUser.id;
    if (!can(actor, 'user.edit.status', {
      type: 'user',
      data: { uid: targetId, role: pendingUser.role || 'staff' },
    })) return;
    try {
      const call = httpsCallable(functions, 'updateUserStatus');
      await call({ uid: targetId, status: 'approved' });
      queryClient.invalidateQueries({ queryKey: USERS_KEY, refetchType: 'none' });
    } catch (err) {
      console.error('Approve failed:', err);
      alert('Failed to approve user: ' + err.message);
    }
  };

  // Leave decisions go through the decideLeaveRequest Cloud Function: it
  // updates the request, debits the balance transactionally (no double-debit
  // on double-approve), writes audit_log, and notifies the employee.
  const decideLeave = async (request, decision, reason) => {
    if (!user?.uid) return;
    try {
      const call = httpsCallable(functions, 'decideLeaveRequest');
      await call({ requestId: request.id, decision, ...(reason ? { reason } : {}) });
      invalidateHRData();
    } catch (err) {
      console.error(`Leave ${decision} failed:`, err);
      alert(`Failed to ${decision === 'approved' ? 'approve' : 'reject'} leave: ` + err.message);
    }
  };

  const handleApproveLeave = (request) => decideLeave(request, 'approved');

  const handleRejectLeave = (request) => {
    const reason = window.prompt(`Reason for rejecting ${request.employeeName ? `${request.employeeName}'s` : 'this'} leave request:`);
    if (reason === null) return; // cancelled the prompt
    return decideLeave(request, 'rejected', reason.trim() || undefined);
  };
  
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading HR System...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          {canSeeHRModule && (
            <>
              <button
                onClick={() => setActiveView('dashboard')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  activeView === 'dashboard' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Dashboard
              </button>
              <ChevronRight size={16} className="text-slate-300" />
            </>
          )}
          <button
            onClick={() => setActiveView('directory')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeView === 'directory' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Staff Directory
          </button>
          {canSeeHRModule && (
            <>
              <ChevronRight size={16} className="text-slate-300" />
              <button
                onClick={() => setActiveView('reports')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  activeView === 'reports' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Reports
              </button>
            </>
          )}
          {activeView === 'employee' && selectedEmployee && (
            <>
              <ChevronRight size={16} className="text-slate-300" />
              <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 font-medium rounded-lg">
                {selectedEmployee.displayName || selectedEmployee.email}
              </span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {can(actor, 'user.invite') && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <UserPlus size={16} /> Invite Employee
            </button>
          )}
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh Data"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>
      
      {/* DASHBOARD VIEW — HR module, people data (hr / Head Admin only) */}
      {activeView === 'dashboard' && canSeeHRModule && (
        <>
          {/* Compliance Alert Banner */}
          {complianceAlerts.length > 0 && (
            <ComplianceAlertBanner 
              alerts={complianceAlerts} 
              onViewAll={() => setActiveView('directory')} 
            />
          )}
          
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
              icon={Users}
              label="Total Staff"
              value={stats.total}
              color="slate"
              onClick={() => setActiveView('directory')}
            />
            <StatCard
              icon={CheckCircle}
              label="Active"
              value={stats.active}
              color="emerald"
              onClick={() => setActiveView('directory')}
            />
            <StatCard
              icon={Clock}
              label="Pending"
              value={stats.pending}
              color="amber"
              onClick={() => setActiveView('directory')}
            />
            <StatCard
              icon={Shield}
              label="Bahraini"
              value={stats.bahraini}
              color="indigo"
            />
            <StatCard
              icon={Globe}
              label="Expat"
              value={stats.expat}
              color="indigo"
            />
            <StatCard
              icon={AlertTriangle}
              label="Alerts"
              value={stats.alerts}
              color="red"
            />
          </div>
          
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column - Pending Approvals & Leave */}
            <div className="lg:col-span-2 space-y-6">
              <PendingApprovalsWidget
                users={employees}
                onApprove={handleQuickApprove}
                onViewUser={handleEmployeeSelect}
                canApprove={(u) => can(actor, 'user.edit.status', {
                  type: 'user',
                  data: { uid: u.uid || u.id, role: u.role || 'staff' },
                })}
              />
              
              <LeaveRequestsWidget
                requests={leaveRequests}
                onApprove={handleApproveLeave}
                onReject={handleRejectLeave}
              />
            </div>
            
            {/* Right Column - Analytics */}
            <div className="space-y-6">
              <BirthdaysAnniversariesWidget employees={employees} />

              <NationalityBreakdown users={employees} />
              
              {/* Quick Actions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4">Quick Actions</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setActiveView('directory')}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <Users size={18} className="text-slate-400 group-hover:text-indigo-600" />
                      <span className="font-medium text-slate-700">View Full Directory</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                  <button
                    onClick={() => setActiveView('reports')}
                    className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl text-left transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-slate-400 group-hover:text-indigo-600" />
                      <span className="font-medium text-slate-700">Reports & Exports</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                  {can(actor, 'settings.read') && (
                    <button
                      onClick={() => navigate('/settings')}
                      className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl text-left transition-colors group"
                    >
                      <div className="flex items-center gap-3">
                        <Settings size={18} className="text-slate-400 group-hover:text-indigo-600" />
                        <span className="font-medium text-slate-700">School Settings</span>
                      </div>
                      <ChevronRight size={16} className="text-slate-300" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
      
      {/* DIRECTORY VIEW */}
      {activeView === 'directory' && (
        <HRDirectory
          user={user}
          userData={userData}
          onSelectEmployee={handleEmployeeSelect}
        />
      )}

      {/* REPORTS VIEW — HR module, people data (hr / Head Admin only) */}
      {activeView === 'reports' && canSeeHRModule && (
        <HRReports employees={employees} actor={actor} />
      )}

      {/* EMPLOYEE DETAIL VIEW */}
      {activeView === 'employee' && selectedEmployee && (
        <EmployeeDetailView
          employee={selectedEmployee}
          onClose={handleBackToDirectory}
          user={user}
          userData={userData}
          onUpdate={() => {/* live subscription auto-refreshes */}}
        />
      )}

      <InviteEmployeeModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        userData={userData}
      />
    </div>
  );
}
