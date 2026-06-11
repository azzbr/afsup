import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useQueryClient } from '@tanstack/react-query';
import { db, functions } from '../firebase';
import {
  NATIONALITIES, BAHRAIN_BANKS, SICK_LEAVE_TIERS, USER_STATUSES,
  ROLE_LABELS, LEAVE_TYPE_LABELS
} from '../constants';
import { actorFrom, can, canSeeRoleView, assignableRoles } from '../permissions';
import { auditUpdate } from '../data/audit';
import { USERS_KEY } from '../data/useUsers';
import { useLeaveRequestsFor } from '../data/useLeaveRequests';
import { complianceAlertsFor } from '../hr/compliance';
import { resolveBalances, sickLeaveBreakdown, remainingDays } from '../hr/leave';
import { uploadFile } from '../storage';
import {
  User, Mail, Phone, Calendar, CreditCard, FileText, Shield,
  Briefcase, Globe, Heart, AlertTriangle, CheckCircle, Clock,
  BadgeCheck, Building2, ChevronLeft, Edit3, Save, Trash2, Lock,
  DollarSign, Plane, Activity, Eye, Printer, UploadCloud,
  UserCheck, UserX, Ban, RefreshCw, History
} from 'lucide-react';

// ============================================================================
// SECTION COMPONENTS
// ============================================================================

const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
        <Icon size={20} className="text-indigo-600" />
      </div>
      <div>
        <h3 className="font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

const InfoField = ({ label, value, icon: Icon, isHighlighted, isMono, isRTL }) => (
  <div className={`p-4 rounded-xl border transition-colors ${isHighlighted ? 'bg-indigo-50 border-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
    <div className="flex items-start gap-3">
      {Icon && (
        <div className={`p-2 rounded-lg shrink-0 ${isHighlighted ? 'bg-indigo-100 text-indigo-600' : 'bg-white text-slate-500'}`}>
          <Icon size={16} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <p className={`text-slate-800 font-medium ${isMono ? 'font-mono' : ''} ${isRTL ? 'text-right' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
          {value || <span className="text-slate-300">Not provided</span>}
        </p>
      </div>
    </div>
  </div>
);

const StatusBadge = ({ status }) => {
  const styles = {
    invited: { bg: 'bg-sky-500', text: 'text-white', icon: Mail, label: 'Invited' },
    pending: { bg: 'bg-amber-500', text: 'text-white', icon: Clock, label: 'Pending' },
    approved: { bg: 'bg-emerald-500', text: 'text-white', icon: CheckCircle, label: 'Active' },
    suspended: { bg: 'bg-orange-500', text: 'text-white', icon: Ban, label: 'Suspended' },
    blocked: { bg: 'bg-red-600', text: 'text-white', icon: UserX, label: 'Blocked' }
  };
  const style = styles[status] || styles.pending;
  const Icon = style.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold ${style.bg} ${style.text}`}>
      <Icon size={14} />
      {style.label}
    </span>
  );
};

// ============================================================================
// COMPLIANCE ALERTS COMPONENT
// ============================================================================

const ComplianceAlerts = ({ employee }) => {
  const alerts = complianceAlertsFor(employee);

  if (alerts.length === 0) return null;

  return (
    <div className="mb-6 space-y-3">
      {alerts.map((alert, i) => {
        const isCritical = alert.severity === 'critical';
        const Icon = isCritical ? AlertTriangle : Clock;
        const tone = isCritical ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800';

        return (
          <div key={`${alert.type}-${i}`} className={`flex items-start gap-3 p-4 rounded-xl border ${tone}`}>
            <Icon size={20} className="shrink-0" />
            <div>
              <p className="font-bold text-sm">{alert.message}</p>
              {typeof alert.daysAway === 'number' && (
                <p className="text-sm opacity-80">
                  {alert.daysAway < 0
                    ? `${Math.abs(alert.daysAway)} days overdue`
                    : `${alert.daysAway} days remaining`}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// LEAVE BALANCE COMPONENT
// ============================================================================

const LeaveBalanceCard = ({ employee }) => {
  const balances = resolveBalances(employee);
  const annualRemaining = remainingDays(balances.annual);
  const sick = sickLeaveBreakdown(balances.sick.used);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Annual Leave */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Plane size={18} />
          <span className="text-sm font-medium">Annual Leave</span>
        </div>
        <p className="text-4xl font-bold">{annualRemaining}</p>
        <p className="text-sm opacity-70">of {balances.annual.entitled} days remaining</p>
      </div>

      {/* Sick Leave - Full Pay */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Activity size={18} />
          <span className="text-sm font-medium">Sick (Full Pay)</span>
        </div>
        <p className="text-4xl font-bold">{sick.fullPayRemaining}</p>
        <p className="text-sm opacity-70">of {SICK_LEAVE_TIERS.FULL_PAY} days</p>
      </div>

      {/* Sick Leave - Half Pay */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Activity size={18} />
          <span className="text-sm font-medium">Sick (Half Pay)</span>
        </div>
        <p className="text-4xl font-bold">{sick.halfPayRemaining}</p>
        <p className="text-sm opacity-70">of {SICK_LEAVE_TIERS.HALF_PAY} days</p>
      </div>

      {/* Sick Leave - Unpaid */}
      <div className="bg-gradient-to-br from-slate-500 to-slate-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Activity size={18} />
          <span className="text-sm font-medium">Sick (Unpaid)</span>
        </div>
        <p className="text-4xl font-bold">{sick.unpaidRemaining}</p>
        <p className="text-sm opacity-70">of {SICK_LEAVE_TIERS.NO_PAY} days</p>
      </div>
    </div>
  );
};

// ============================================================================
// LEAVE HISTORY TABLE
// ============================================================================

const LEAVE_STATUS_CHIP = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-700 border-red-200'
};

const fmtLeaveDate = (d) =>
  d instanceof Date && !isNaN(d.getTime())
    ? d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const LeaveHistory = ({ requests, isLoading }) => {
  if (isLoading) {
    return (
      <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-100">
        <p className="text-slate-400 font-medium">Loading leave history...</p>
      </div>
    );
  }

  if (requests.length === 0) {
    return (
      <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-100">
        <Calendar size={48} className="text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500 font-medium">No leave history available</p>
        <p className="text-sm text-slate-400">Leave requests will appear here once submitted</p>
      </div>
    );
  }

  const sorted = [...requests].sort(
    (a, b) => (b.submittedAt?.getTime() || 0) - (a.submittedAt?.getTime() || 0)
  );

  return (
    <div className="bg-white rounded-xl border border-slate-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Dates</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Days</th>
              <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((request) => (
              <tr key={request.id}>
                <td className="px-4 py-3 text-sm font-medium text-slate-700">
                  {LEAVE_TYPE_LABELS[request.leaveType || 'annual'] || request.leaveType}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  {fmtLeaveDate(request.leaveStart)} - {fmtLeaveDate(request.leaveEnd)}
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{request.daysRequested || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${LEAVE_STATUS_CHIP[request.status] || LEAVE_STATUS_CHIP.pending}`}>
                    {request.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ============================================================================
// DOCUMENTS SECTION
// ============================================================================

// Mirrors the self-upload rules in UserProfile.jsx's DocumentUpload exactly:
// same accepted content types and the same 5MB cap enforced by
// firebase.storage.rules (which otherwise rejects with a misleading
// "storage/unauthorized" error).
const DOC_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const DOC_MAX_BYTES = 5 * 1024 * 1024;

// Same doc-type keys as the DocumentVault in UserProfile.jsx so HR uploads
// land in the same documents.{key} slots as self-uploads, plus the
// HR-only Employment Contract slot this view already had.
const DOC_TYPES = [
  { key: 'cpr_front', label: 'CPR — Front Side', icon: CreditCard },
  { key: 'cpr_back', label: 'CPR — Back Side', icon: CreditCard },
  { key: 'cpr', label: 'CPR (Smart Card)', icon: CreditCard },
  { key: 'passport', label: 'Passport Copy', icon: FileText },
  { key: 'iban', label: 'IBAN Certificate', icon: DollarSign },
  { key: 'cv', label: 'Curriculum Vitae (CV)', icon: FileText },
  { key: 'degree', label: 'University Degree', icon: BadgeCheck },
  { key: 'transcripts', label: 'Transcripts', icon: FileText },
  { key: 'quadrabay', label: 'QuadraBay Verification', icon: Shield },
  { key: 'moe_approval', label: 'MOE Teacher Approval', icon: Shield },
  { key: 'contract', label: 'Employment Contract', icon: Briefcase }
];

const DocumentsSection = ({ employee, canEdit, actorUid }) => {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState({});
  const [errors, setErrors] = useState({});

  const documents = employee.documents || {};
  const employeeUid = employee.uid || employee.id;

  const setSlotError = (key, message) =>
    setErrors(prev => ({ ...prev, [key]: message }));

  const handleFileChange = async (key, e) => {
    const file = e.target.files[0];
    // Reset the input so picking the same file again after a failure re-fires.
    e.target.value = '';
    if (!file) return;

    if (!DOC_ALLOWED_TYPES.includes(file.type)) {
      setSlotError(key, 'Only PDF, JPG, and PNG files are allowed.');
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      setSlotError(key, `File is too large (${mb} MB). Maximum allowed is 5 MB. Try a JPG (not PNG) or compress the image first.`);
      return;
    }

    setSlotError(key, null);
    setUploading(prev => ({ ...prev, [key]: true }));
    try {
      // Same path convention as the self-upload: hr-documents/UID/TYPE_TS.ext
      const ext = file.name.split('.').pop();
      const path = `hr-documents/${employeeUid}/${key}_${Date.now()}.${ext}`;
      const result = await uploadFile(file, path);

      if (!result.success) {
        // Translate the misleading storage/unauthorized into something useful.
        const raw = String(result.error || '');
        setSlotError(key, raw.includes('unauthorized')
          ? 'Upload rejected. Check that the file is under 5 MB and is a JPG, PNG, or PDF. If it still fails, sign out and back in.'
          : 'Upload failed: ' + raw);
        return;
      }

      await updateDoc(doc(db, 'users', employeeUid), {
        [`documents.${key}`]: result.downloadURL,
        ...auditUpdate(actorUid)
      });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
    } catch (error) {
      console.error('Document upload failed:', error);
      setSlotError(key, 'Could not save document: ' + error.message);
    } finally {
      setUploading(prev => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {DOC_TYPES.map(({ key, label, icon: Icon }) => {
        const url = documents[key];
        const hasDoc = !!url;
        const isUploading = !!uploading[key];
        const error = errors[key];

        return (
          <div
            key={key}
            className={`p-4 rounded-xl border transition-colors
              ${hasDoc ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${hasDoc ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-400'}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{label}</p>
                  <p className={`text-xs ${hasDoc ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {hasDoc ? 'Uploaded' : 'Not uploaded'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {hasDoc && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    title="View Document"
                    className="p-2 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  >
                    <Eye size={16} />
                  </a>
                )}
                {canEdit && (
                  <label
                    className={`cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                      ${isUploading ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                  >
                    {isUploading ? 'Uploading...' : <><UploadCloud size={14} /> {hasDoc ? 'Replace' : 'Upload'}</>}
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png"
                      disabled={isUploading}
                      onChange={e => handleFileChange(key, e)}
                    />
                  </label>
                )}
              </div>
            </div>
            {error && (
              <p className="mt-2 text-xs font-medium text-red-600">{error}</p>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// MAIN EMPLOYEE DETAIL VIEW COMPONENT
// ============================================================================

// The only fields the edit form touches. Saves diff against these so an
// untouched (or empty-initialized) input can never overwrite stored data.
const EDITABLE_TEXT_FIELDS = [
  'firstName', 'middleName', 'lastName', 'arabicName', 'nationality', 'gender',
  'maritalStatus', 'phoneNumber', 'cprNumber', 'passportNumber',
  'residencePermitNumber', 'workPermitNumber', 'bankName', 'iban'
];
const EDITABLE_DATE_FIELDS = ['cprExpiry', 'passportExpiry', 'residencePermitExpiry', 'dateOfJoining'];

// JS Date -> yyyy-mm-dd for <input type="date">; '' when unset. Uses local
// date components (not toISOString) so the day never shifts across timezones.
const toInputDate = (d) => {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const STATUS_ACTIONS = {
  invited: { icon: Mail, label: 'Invited', classes: 'bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700' },
  pending: { icon: Clock, label: 'Pending', classes: 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-700' },
  approved: { icon: UserCheck, label: 'Approve', classes: 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200 text-emerald-700' },
  suspended: { icon: Ban, label: 'Suspend', classes: 'bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700' },
  blocked: { icon: UserX, label: 'Block', classes: 'bg-red-50 hover:bg-red-100 border-red-200 text-red-700' }
};

export default function EmployeeDetailView({ employee, onClose, user, userData, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  const employeeUid = employee?.uid || employee?.id;

  const actor = actorFrom(userData);
  const userTarget = employee
    ? { type: 'user', data: { uid: employeeUid, role: employee.role || 'staff' } }
    : undefined;
  const canChangeStatus = can(actor, 'user.edit.status', userTarget);
  const canChangeRole = can(actor, 'user.edit.role', userTarget);
  const canDelete = can(actor, 'user.delete', userTarget);
  // HR-privacy lockdown: leave data and the HR document vault are people
  // data — operations admins lose them even when they keep lifecycle power
  // over staff/maintenance accounts. canSeeRoleView('hr') tracks the
  // hr/super_admin pair; storage rules deny document reads to anyone else.
  const canSeeHR = canSeeRoleView(actor, 'hr');
  const canSeeLeave = can(actor, 'leave.view.all') || can(actor, 'user.edit.salary', userTarget);
  const canSeeDocuments = canSeeHR;
  // Client-side HR record edits (identity, banking, joining date) follow the
  // matrix row "Edit other users' profile fields" — hr/super_admin only.
  // Lifecycle power alone (plain admin over staff) no longer implies it.
  const canEdit = canSeeHR && canChangeStatus;
  const showAdminTab = canChangeStatus || canChangeRole || canDelete;
  const roleOptions = assignableRoles(actor);

  // Subscribe only when the viewer may see this person's leave data.
  const { data: leaveRequests = [], isLoading: leaveLoading } =
    useLeaveRequestsFor(canSeeLeave ? (employeeUid ?? null) : null);

  // Format date helper — hook data is already JS Dates, never Timestamps
  const formatDate = (d) => {
    if (!(d instanceof Date) || isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Calculate tenure
  const calculateTenure = () => {
    const joinDate = employee?.dateOfJoining;
    if (!(joinDate instanceof Date) || isNaN(joinDate.getTime())) return null;
    const now = new Date();
    const years = Math.floor((now - joinDate) / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor(((now - joinDate) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    if (years > 0) return `${years}y ${months}m`;
    return `${months} months`;
  };

  // Initialize edit data — only the editable fields, never the whole doc
  useEffect(() => {
    if (!employee) return;
    const next = {};
    for (const field of EDITABLE_TEXT_FIELDS) next[field] = employee[field] || '';
    for (const field of EDITABLE_DATE_FIELDS) next[field] = toInputDate(employee[field]);
    setEditData(next);
  }, [employee]);
  
  // Handle save — write ONLY the fields that actually changed
  const handleSave = async () => {
    setLoading(true);
    try {
      const updates = {};
      for (const field of EDITABLE_TEXT_FIELDS) {
        const next = editData[field] ?? '';
        if (next !== (employee[field] || '')) updates[field] = next;
      }
      for (const field of EDITABLE_DATE_FIELDS) {
        const next = editData[field] || '';
        if (next === toInputDate(employee[field])) continue;
        // Date inputs hold yyyy-mm-dd strings; Firestore stores JS Dates as
        // Timestamps. Null only when the user deliberately cleared a value.
        updates[field] = next ? new Date(next) : null;
      }

      if (Object.keys(updates).length > 0) {
        await updateDoc(doc(db, 'users', employeeUid), {
          ...updates,
          ...auditUpdate(user.uid)
        });
        queryClient.invalidateQueries({ queryKey: USERS_KEY });
      }
      setIsEditing(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Update error:', error);
      alert('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Status, role, and delete go through Cloud Functions: firestore.rules make
  // role/status immutable from the client and deny user doc deletes. The
  // callables validate permission server-side and write audit_log atomically.

  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Are you sure you want to change status to "${newStatus}"?`)) return;

    setLoading(true);
    try {
      const call = httpsCallable(functions, 'updateUserStatus');
      await call({ uid: employeeUid, status: newStatus });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Status change failed:', error);
      alert(`Could not change status: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (newRole) => {
    if (!confirm(`Change role to "${ROLE_LABELS[newRole] || newRole}"?`)) return;

    setLoading(true);
    try {
      const call = httpsCallable(functions, 'updateUserRole');
      await call({ uid: employeeUid, role: newRole });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Role change failed:', error);
      alert(`Could not change role: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const name = employee.displayName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || employee.email;
    if (!confirm(`Permanently delete ${name}?\n\nThis removes their account and cannot be undone.`)) return;

    setLoading(true);
    try {
      const call = httpsCallable(functions, 'deleteUser');
      await call({ uid: employeeUid });
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error('Delete failed:', error);
      alert(`Could not delete user: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };
  
  if (!employee) return null;
  
  const initials = `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const tenure = calculateTenure();
  const isBahraini = employee.nationality === 'Bahraini';
  
  const tabs = [
    { id: 'overview', label: 'Overview', icon: User },
    ...(canSeeDocuments ? [{ id: 'documents', label: 'Documents', icon: FileText }] : []),
    { id: 'employment', label: 'Employment', icon: Briefcase },
    ...(canSeeLeave ? [{ id: 'leave', label: 'Leave & Attendance', icon: Calendar }] : []),
    ...(showAdminTab ? [{ id: 'admin', label: 'Admin Actions', icon: Shield }] : [])
  ];
  
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
      {/* Header */}
      <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full blur-3xl" />
        </div>
        
        <div className="relative p-6">
          {/* Top Actions */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={onClose}
              className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
            >
              <ChevronLeft size={20} />
              <span className="text-sm font-medium">Back to Directory</span>
            </button>
            
            <div className="flex items-center gap-2">
              {canEdit && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Edit3 size={16} />
                  Edit Profile
                </button>
              )}
              {isEditing && (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Save size={16} />
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
              <button
                onClick={() => window.print()}
                title="Print profile"
                className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
          
          {/* Profile Info */}
          <div className="flex flex-col md:flex-row md:items-end gap-6">
            {/* Avatar */}
            <div className={`w-28 h-28 rounded-2xl flex items-center justify-center text-4xl font-bold shadow-2xl border-4 border-white/20
              ${employee.status === 'approved' 
                ? 'bg-gradient-to-br from-indigo-400 to-purple-500' 
                : 'bg-gradient-to-br from-slate-500 to-slate-600'
              }`}>
              {initials}
            </div>
            
            {/* Name & Info */}
            <div className="flex-1">
              <div className="flex items-start gap-4 mb-2">
                <div>
                  <h1 className="text-3xl font-bold">
                    {employee.displayName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unnamed Employee'}
                  </h1>
                  {employee.arabicName && (
                    <p className="text-xl text-white/70 font-arabic mt-1" dir="rtl">{employee.arabicName}</p>
                  )}
                </div>
                <StatusBadge status={employee.status} />
              </div>
              
              <div className="flex flex-wrap items-center gap-4 text-white/70 text-sm">
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {employee.email}
                </span>
                {employee.phoneNumber && (
                  <span className="flex items-center gap-1.5">
                    <Phone size={14} />
                    {employee.phoneNumber}
                  </span>
                )}
                {tenure && (
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} />
                    {tenure} tenure
                  </span>
                )}
              </div>
            </div>
            
            {/* Role Badge */}
            <div className="md:text-right">
              <span className="inline-block px-4 py-2 bg-white/10 rounded-xl text-sm font-bold uppercase tracking-wide">
                {ROLE_LABELS[employee.role] || ROLE_LABELS.staff}
              </span>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="relative flex gap-1 px-6 pt-2 border-t border-white/10">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-xl transition-colors
                ${activeTab === tab.id 
                  ? 'bg-white text-slate-900' 
                  : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6">
        {/* Compliance Alerts */}
        <ComplianceAlerts employee={employee} />
        
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Personal Information */}
            <section>
              <SectionHeader icon={User} title="Personal Information" subtitle="Basic identity and contact details" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">First Name</label>
                      <input
                        type="text"
                        value={editData.firstName || ''}
                        onChange={e => setEditData({...editData, firstName: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Middle Name</label>
                      <input
                        type="text"
                        value={editData.middleName || ''}
                        onChange={e => setEditData({...editData, middleName: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Last Name</label>
                      <input
                        type="text"
                        value={editData.lastName || ''}
                        onChange={e => setEditData({...editData, lastName: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Arabic Name (GOSI)</label>
                      <input
                        type="text"
                        dir="rtl"
                        value={editData.arabicName || ''}
                        onChange={e => setEditData({...editData, arabicName: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Nationality</label>
                      <select
                        value={editData.nationality || 'Bahraini'}
                        onChange={e => setEditData({...editData, nationality: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      >
                        {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Gender</label>
                      <select
                        value={editData.gender || 'Male'}
                        onChange={e => setEditData({...editData, gender: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Marital Status</label>
                      <select
                        value={editData.maritalStatus || 'Single'}
                        onChange={e => setEditData({...editData, maritalStatus: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Phone Number</label>
                      <input
                        type="tel"
                        value={editData.phoneNumber || ''}
                        onChange={e => setEditData({...editData, phoneNumber: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                        placeholder="+973 0000 0000"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoField icon={User} label="Full Name (English)" value={employee.displayName || `${employee.firstName || ''} ${employee.middleName || ''} ${employee.lastName || ''}`.trim()} />
                    <InfoField icon={User} label="Arabic Name (GOSI)" value={employee.arabicName} isRTL />
                    <InfoField icon={Globe} label="Nationality" value={employee.nationality} isHighlighted={employee.nationality !== 'Bahraini'} />
                    <InfoField icon={User} label="Gender" value={employee.gender} />
                    <InfoField icon={Heart} label="Marital Status" value={employee.maritalStatus} />
                    <InfoField icon={Phone} label="Phone Number" value={employee.phoneNumber} />
                    <InfoField icon={Mail} label="Email Address" value={employee.email} />
                  </>
                )}
              </div>
            </section>
            
            {/* Identity Documents */}
            <section>
              <SectionHeader icon={CreditCard} title="Identity Documents" subtitle="CPR, Passport, and Visa details" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">CPR Number</label>
                      <input
                        type="text"
                        value={editData.cprNumber || ''}
                        onChange={e => setEditData({...editData, cprNumber: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="9 digits"
                        maxLength={9}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">CPR Expiry Date</label>
                      <input
                        type="date"
                        value={editData.cprExpiry || ''}
                        onChange={e => setEditData({...editData, cprExpiry: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Passport Number</label>
                      <input
                        type="text"
                        value={editData.passportNumber || ''}
                        onChange={e => setEditData({...editData, passportNumber: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Passport Expiry</label>
                      <input
                        type="date"
                        value={editData.passportExpiry || ''}
                        onChange={e => setEditData({...editData, passportExpiry: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                    {editData.nationality !== 'Bahraini' && (
                      <>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Residence Permit #</label>
                          <input
                            type="text"
                            value={editData.residencePermitNumber || ''}
                            onChange={e => setEditData({...editData, residencePermitNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">RP Expiry Date</label>
                          <input
                            type="date"
                            value={editData.residencePermitExpiry || ''}
                            onChange={e => setEditData({...editData, residencePermitExpiry: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-slate-500 uppercase">Work Permit #</label>
                          <input
                            type="text"
                            value={editData.workPermitNumber || ''}
                            onChange={e => setEditData({...editData, workPermitNumber: e.target.value})}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <InfoField icon={CreditCard} label="CPR Number" value={employee.cprNumber} isMono isHighlighted />
                    <InfoField icon={Calendar} label="CPR Expiry" value={formatDate(employee.cprExpiry)} />
                    <InfoField icon={FileText} label="Passport Number" value={employee.passportNumber} isMono />
                    <InfoField icon={Calendar} label="Passport Expiry" value={formatDate(employee.passportExpiry)} />
                    {!isBahraini && (
                      <>
                        <InfoField icon={Shield} label="Residence Permit #" value={employee.residencePermitNumber} isMono isHighlighted />
                        <InfoField icon={Calendar} label="RP Expiry" value={formatDate(employee.residencePermitExpiry)} isHighlighted />
                        <InfoField icon={Briefcase} label="Work Permit #" value={employee.workPermitNumber} isMono />
                      </>
                    )}
                  </>
                )}
              </div>
            </section>
            
            {/* Banking (WPS) */}
            <section>
              <SectionHeader icon={DollarSign} title="Banking & Payroll (WPS)" subtitle="Wage Protection System compliance" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Bank Name</label>
                      <select
                        value={editData.bankName || BAHRAIN_BANKS[0]}
                        onChange={e => setEditData({...editData, bankName: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      >
                        {BAHRAIN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">IBAN (Bahrain)</label>
                      <input
                        type="text"
                        value={editData.iban || ''}
                        onChange={e => setEditData({...editData, iban: e.target.value.toUpperCase()})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                        placeholder="BH00XXXX00000000000000"
                        maxLength={22}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoField icon={Building2} label="Bank Name" value={employee.bankName} />
                    <InfoField icon={CreditCard} label="IBAN" value={employee.iban} isMono isHighlighted />
                  </>
                )}
              </div>
            </section>
          </div>
        )}
        
        {/* Documents Tab — HR document vault, hr/super_admin only */}
        {activeTab === 'documents' && canSeeDocuments && (
          <div>
            <SectionHeader icon={FileText} title="HR Documents" subtitle="Official documentation and certificates" />
            <DocumentsSection employee={employee} canEdit={canEdit} actorUid={user?.uid} />
          </div>
        )}
        
        {/* Employment Tab */}
        {activeTab === 'employment' && (
          <div className="space-y-8">
            <section>
              <SectionHeader icon={Briefcase} title="Employment Details" subtitle="Job information and history" />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {isEditing ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Date of Joining</label>
                      <input
                        type="date"
                        value={editData.dateOfJoining || ''}
                        onChange={e => setEditData({...editData, dateOfJoining: e.target.value})}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <InfoField icon={Calendar} label="Date of Joining" value={formatDate(employee.dateOfJoining)} isHighlighted />
                    <InfoField icon={Clock} label="Tenure" value={tenure || 'Not available'} />
                    <InfoField icon={Shield} label="Current Role" value={ROLE_LABELS[employee.role] || ROLE_LABELS.staff} />
                    <InfoField icon={CheckCircle} label="Account Status" value={employee.status?.toUpperCase() || 'PENDING'} />
                    <InfoField icon={Calendar} label="Created At" value={formatDate(employee.createdAt)} />
                    <InfoField icon={RefreshCw} label="Last Updated" value={formatDate(employee.updatedAt)} />
                  </>
                )}
              </div>
            </section>
          </div>
        )}
        
        {/* Leave Tab — balances + history are HR data */}
        {activeTab === 'leave' && canSeeLeave && (
          <div className="space-y-8">
            <section>
              <SectionHeader icon={Plane} title="Leave Balances" subtitle="Annual and sick leave tracking per Bahrain Labor Law" />
              <LeaveBalanceCard employee={employee} />
            </section>
            
            <section>
              <SectionHeader icon={History} title="Leave History" subtitle="Past leave requests and approvals" />
              <LeaveHistory requests={leaveRequests} isLoading={leaveLoading} />
            </section>
          </div>
        )}
        
        {/* Admin Actions Tab */}
        {activeTab === 'admin' && showAdminTab && (
          <div className="space-y-8">
            {/* Status Management */}
            {canChangeStatus && (
              <section>
                <SectionHeader
                  icon={Shield}
                  title="Account Status Management"
                  subtitle="Move this account through its lifecycle"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {USER_STATUSES.map(status => {
                    const action = STATUS_ACTIONS[status];
                    const ActionIcon = action.icon;
                    return (
                      <button
                        key={status}
                        onClick={() => handleStatusChange(status)}
                        disabled={loading || employee.status === status}
                        className={`p-4 border-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2 ${action.classes}`}
                      >
                        <ActionIcon size={24} />
                        <span>{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Role Management */}
            {canChangeRole && roleOptions.length > 0 && (
              <section>
                <SectionHeader
                  icon={Lock}
                  title="Role Assignment"
                  subtitle="Change employee access level"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                  {roleOptions.map(role => (
                    <button
                      key={role}
                      onClick={() => handleRoleChange(role)}
                      disabled={loading || employee.role === role}
                      className={`p-4 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2 border-2
                        ${employee.role === role
                          ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                          : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                    >
                      <Shield size={24} />
                      <span className="uppercase text-sm">{ROLE_LABELS[role]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Danger Zone */}
            {canDelete && (
              <section>
                <SectionHeader
                  icon={AlertTriangle}
                  title="Danger Zone"
                  subtitle="Irreversible actions - proceed with caution"
                />
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-red-800">Delete Employee Account</h4>
                      <p className="text-sm text-red-600 mt-1">
                        Permanently remove this employee from the system. This action cannot be undone.
                      </p>
                    </div>
                    <button
                      onClick={handleDelete}
                      disabled={loading}
                      className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      Delete Permanently
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
