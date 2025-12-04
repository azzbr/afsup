import React, { useState, useEffect } from 'react';
import { doc, updateDoc, getDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { NATIONALITIES, BAHRAIN_BANKS, SICK_LEAVE_TIERS } from '../constants';
import {
  User, Mail, Phone, MapPin, Calendar, CreditCard, FileText, Shield,
  Briefcase, Globe, Heart, AlertTriangle, CheckCircle, Clock, X,
  BadgeCheck, Building2, ChevronLeft, Edit3, Save, Trash2, Lock,
  DollarSign, Plane, Activity, Eye, UploadCloud, Download, Printer,
  UserCheck, UserX, Ban, RefreshCw, History, MessageSquare
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
    approved: { bg: 'bg-emerald-500', text: 'text-white', icon: CheckCircle, label: 'Active' },
    pending: { bg: 'bg-amber-500', text: 'text-white', icon: Clock, label: 'Pending' },
    suspended: { bg: 'bg-red-500', text: 'text-white', icon: Ban, label: 'Suspended' },
    terminated: { bg: 'bg-slate-500', text: 'text-white', icon: UserX, label: 'Terminated' }
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
  const alerts = [];
  const now = new Date();
  const threeMonths = new Date(); threeMonths.setMonth(now.getMonth() + 3);
  const oneMonth = new Date(); oneMonth.setMonth(now.getMonth() + 1);
  
  // CPR Check
  if (employee.cprExpiry?.toDate) {
    const expiry = employee.cprExpiry.toDate();
    if (expiry < now) {
      alerts.push({ type: 'critical', icon: AlertTriangle, title: 'CPR EXPIRED', detail: `Expired on ${expiry.toLocaleDateString()}` });
    } else if (expiry < threeMonths) {
      alerts.push({ type: 'warning', icon: Clock, title: 'CPR Expiring Soon', detail: `Expires on ${expiry.toLocaleDateString()}` });
    }
  }
  
  // Visa Check (Non-Bahrainis)
  if (employee.nationality !== 'Bahraini' && employee.residencePermitExpiry?.toDate) {
    const expiry = employee.residencePermitExpiry.toDate();
    if (expiry < now) {
      alerts.push({ type: 'critical', icon: AlertTriangle, title: 'VISA EXPIRED', detail: `LMRA violation - expired on ${expiry.toLocaleDateString()}` });
    } else if (expiry < oneMonth) {
      alerts.push({ type: 'warning', icon: Clock, title: 'Visa Expiring', detail: `Expires on ${expiry.toLocaleDateString()}` });
    }
  }
  
  // Passport Check
  if (employee.passportExpiry?.toDate) {
    const expiry = employee.passportExpiry.toDate();
    if (expiry < threeMonths) {
      alerts.push({ type: 'warning', icon: FileText, title: 'Passport Expiring', detail: `Expires on ${expiry.toLocaleDateString()}` });
    }
  }
  
  // Banking Check
  if (!employee.iban || !employee.iban.startsWith('BH')) {
    alerts.push({ type: 'info', icon: CreditCard, title: 'Missing/Invalid IBAN', detail: 'WPS compliance requires valid Bahrain IBAN' });
  }
  
  // Arabic Name (GOSI)
  if (!employee.arabicName && employee.nationality === 'Bahraini') {
    alerts.push({ type: 'info', icon: FileText, title: 'Arabic Name Missing', detail: 'Required for GOSI & Ministry documents' });
  }
  
  if (alerts.length === 0) return null;
  
  return (
    <div className="mb-6 space-y-3">
      {alerts.map((alert, i) => {
        const bgColor = alert.type === 'critical' ? 'bg-red-50 border-red-200' :
                       alert.type === 'warning' ? 'bg-amber-50 border-amber-200' :
                       'bg-blue-50 border-blue-200';
        const textColor = alert.type === 'critical' ? 'text-red-800' :
                         alert.type === 'warning' ? 'text-amber-800' :
                         'text-blue-800';
        const Icon = alert.icon;
        
        return (
          <div key={i} className={`flex items-start gap-3 p-4 rounded-xl border ${bgColor}`}>
            <Icon size={20} className={textColor} />
            <div>
              <p className={`font-bold text-sm ${textColor}`}>{alert.title}</p>
              <p className={`text-sm opacity-80 ${textColor}`}>{alert.detail}</p>
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
  const annualBalance = employee.annualLeaveBalance || 30;
  const sickUsed = employee.sickDaysUsed || 0;
  
  // Bahrain Labor Law Sick Leave Calculation
  const fullPayBalance = Math.max(0, SICK_LEAVE_TIERS.FULL_PAY - Math.min(sickUsed, SICK_LEAVE_TIERS.FULL_PAY));
  const halfPayUsed = Math.max(0, sickUsed - SICK_LEAVE_TIERS.FULL_PAY);
  const halfPayBalance = Math.max(0, SICK_LEAVE_TIERS.HALF_PAY - Math.min(halfPayUsed, SICK_LEAVE_TIERS.HALF_PAY));
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Annual Leave */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Plane size={18} />
          <span className="text-sm font-medium">Annual Leave</span>
        </div>
        <p className="text-4xl font-bold">{annualBalance}</p>
        <p className="text-sm opacity-70">days remaining</p>
      </div>
      
      {/* Sick Leave - Full Pay */}
      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Activity size={18} />
          <span className="text-sm font-medium">Sick (Full Pay)</span>
        </div>
        <p className="text-4xl font-bold">{fullPayBalance}</p>
        <p className="text-sm opacity-70">of {SICK_LEAVE_TIERS.FULL_PAY} days</p>
      </div>
      
      {/* Sick Leave - Half Pay */}
      <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-5 text-white">
        <div className="flex items-center gap-2 mb-2 opacity-80">
          <Activity size={18} />
          <span className="text-sm font-medium">Sick (Half Pay)</span>
        </div>
        <p className="text-4xl font-bold">{halfPayBalance}</p>
        <p className="text-sm opacity-70">of {SICK_LEAVE_TIERS.HALF_PAY} days</p>
      </div>
    </div>
  );
};

// ============================================================================
// DOCUMENTS SECTION
// ============================================================================

const DocumentsSection = ({ employee, canEdit }) => {
  const documents = employee.documents || {};
  
  const docTypes = [
    { key: 'passport', label: 'Passport Copy', icon: FileText },
    { key: 'cpr', label: 'CPR (Smart Card)', icon: CreditCard },
    { key: 'iban', label: 'IBAN Certificate', icon: DollarSign },
    { key: 'degree', label: 'University Degree', icon: BadgeCheck },
    { key: 'transcripts', label: 'Transcripts', icon: FileText },
    { key: 'quadrabay', label: 'QuadraBay Verification', icon: Shield },
    { key: 'moe_approval', label: 'MOE Teacher Approval', icon: Shield },
    { key: 'contract', label: 'Employment Contract', icon: Briefcase }
  ];
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {docTypes.map(({ key, label, icon: Icon }) => {
        const url = documents[key];
        const hasDoc = !!url;
        
        return (
          <div
            key={key}
            className={`flex items-center justify-between p-4 rounded-xl border transition-colors
              ${hasDoc ? 'bg-emerald-50 border-emerald-100' : 'bg-slate-50 border-slate-100'}`}
          >
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
            
            {hasDoc && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="p-2 bg-white border border-slate-200 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
              >
                <Eye size={16} />
              </a>
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

export default function EmployeeDetailView({ employee, onClose, user, userData, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  const canEdit = ['admin', 'hr'].includes(userData?.role);
  const isAdmin = userData?.role === 'admin';
  
  // Format date helper
  const formatDate = (d) => {
    if (!d) return null;
    if (d.toDate) return d.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  
  // Calculate tenure
  const calculateTenure = () => {
    if (!employee.dateOfJoining?.toDate) return null;
    const joinDate = employee.dateOfJoining.toDate();
    const now = new Date();
    const years = Math.floor((now - joinDate) / (365.25 * 24 * 60 * 60 * 1000));
    const months = Math.floor(((now - joinDate) % (365.25 * 24 * 60 * 60 * 1000)) / (30.44 * 24 * 60 * 60 * 1000));
    if (years > 0) return `${years}y ${months}m`;
    return `${months} months`;
  };
  
  // Initialize edit data
  useEffect(() => {
    if (employee) {
      const fmt = (d) => d?.toDate ? d.toDate().toISOString().split('T')[0] : '';
      setEditData({
        ...employee,
        cprExpiry: fmt(employee.cprExpiry),
        passportExpiry: fmt(employee.passportExpiry),
        residencePermitExpiry: fmt(employee.residencePermitExpiry),
        dateOfJoining: fmt(employee.dateOfJoining)
      });
    }
  }, [employee]);
  
  // Handle save
  const handleSave = async () => {
    setLoading(true);
    try {
      const updates = {
        ...editData,
        cprExpiry: editData.cprExpiry ? new Date(editData.cprExpiry) : null,
        passportExpiry: editData.passportExpiry ? new Date(editData.passportExpiry) : null,
        residencePermitExpiry: editData.residencePermitExpiry ? new Date(editData.residencePermitExpiry) : null,
        dateOfJoining: editData.dateOfJoining ? new Date(editData.dateOfJoining) : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };
      
      await updateDoc(doc(db, 'users', employee.id), updates);
      setIsEditing(false);
      if (onUpdate) onUpdate();
      alert('Employee profile updated successfully!');
    } catch (error) {
      console.error('Update error:', error);
      alert('Error updating profile: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle status change
  const handleStatusChange = async (newStatus) => {
    if (!confirm(`Are you sure you want to change status to "${newStatus}"?`)) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', employee.id), {
        status: newStatus,
        [`${newStatus}At`]: serverTimestamp(),
        updatedBy: user.uid,
        isActive: newStatus === 'approved'
      });
      if (onUpdate) onUpdate();
      alert(`Status changed to ${newStatus}`);
    } catch (error) {
      console.error('Status change error:', error);
      alert('Error changing status: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle role change
  const handleRoleChange = async (newRole) => {
    if (!confirm(`Change role to "${newRole}"?`)) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'users', employee.id), {
        role: newRole,
        updatedBy: user.uid,
        updatedAt: serverTimestamp()
      });
      if (onUpdate) onUpdate();
      alert(`Role changed to ${newRole}`);
    } catch (error) {
      console.error('Role change error:', error);
      alert('Error changing role: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle delete
  const handleDelete = async () => {
    if (!confirm('⚠️ DELETE THIS USER PERMANENTLY?\n\nThis action cannot be undone!')) return;
    if (!confirm('Are you absolutely sure? Type "yes" in the next prompt.')) return;
    
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'users', employee.id));
      if (onUpdate) onUpdate();
      onClose();
      alert('User deleted successfully');
    } catch (error) {
      console.error('Delete error:', error);
      alert('Error deleting user: ' + error.message);
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
    { id: 'documents', label: 'Documents', icon: FileText },
    { id: 'employment', label: 'Employment', icon: Briefcase },
    { id: 'leave', label: 'Leave & Attendance', icon: Calendar },
    ...(canEdit ? [{ id: 'admin', label: 'Admin Actions', icon: Shield }] : [])
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
              <button className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition-colors">
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
                {employee.role || 'Staff'}
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
        
        {/* Documents Tab */}
        {activeTab === 'documents' && (
          <div>
            <SectionHeader icon={FileText} title="HR Documents" subtitle="Official documentation and certificates" />
            <DocumentsSection employee={employee} canEdit={canEdit} />
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
                    <InfoField icon={Shield} label="Current Role" value={employee.role?.toUpperCase() || 'STAFF'} />
                    <InfoField icon={CheckCircle} label="Account Status" value={employee.status?.toUpperCase() || 'PENDING'} />
                    <InfoField icon={Calendar} label="Created At" value={formatDate(employee.createdAt)} />
                    <InfoField icon={RefreshCw} label="Last Updated" value={formatDate(employee.updatedAt)} />
                  </>
                )}
              </div>
            </section>
          </div>
        )}
        
        {/* Leave Tab */}
        {activeTab === 'leave' && (
          <div className="space-y-8">
            <section>
              <SectionHeader icon={Plane} title="Leave Balances" subtitle="Annual and sick leave tracking per Bahrain Labor Law" />
              <LeaveBalanceCard employee={employee} />
            </section>
            
            <section>
              <SectionHeader icon={History} title="Leave History" subtitle="Past leave requests and approvals" />
              <div className="bg-slate-50 rounded-xl p-8 text-center border border-slate-100">
                <Calendar size={48} className="text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500 font-medium">No leave history available</p>
                <p className="text-sm text-slate-400">Leave requests will appear here once submitted</p>
              </div>
            </section>
          </div>
        )}
        
        {/* Admin Actions Tab */}
        {activeTab === 'admin' && canEdit && (
          <div className="space-y-8">
            {/* Status Management */}
            <section>
              <SectionHeader 
                icon={Shield} 
                title="Account Status Management" 
                subtitle="Approve, suspend, or terminate employee accounts" 
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => handleStatusChange('approved')}
                  disabled={loading || employee.status === 'approved'}
                  className="p-4 bg-emerald-50 hover:bg-emerald-100 border-2 border-emerald-200 rounded-xl text-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2"
                >
                  <UserCheck size={24} />
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => handleStatusChange('pending')}
                  disabled={loading || employee.status === 'pending'}
                  className="p-4 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 rounded-xl text-amber-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2"
                >
                  <Clock size={24} />
                  <span>Set Pending</span>
                </button>
                <button
                  onClick={() => handleStatusChange('suspended')}
                  disabled={loading || employee.status === 'suspended'}
                  className="p-4 bg-orange-50 hover:bg-orange-100 border-2 border-orange-200 rounded-xl text-orange-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center gap-2"
                >
                  <Ban size={24} />
                  <span>Suspend</span>
                </button>
                <button
                  onClick={() => handleStatusChange('terminated')}
                  disabled={loading}
                  className="p-4 bg-red-50 hover:bg-red-100 border-2 border-red-200 rounded-xl text-red-700 font-medium transition-colors disabled:opacity-50 flex flex-col items-center gap-2"
                >
                  <UserX size={24} />
                  <span>Terminate</span>
                </button>
              </div>
            </section>
            
            {/* Role Management */}
            {isAdmin && (
              <section>
                <SectionHeader 
                  icon={Lock} 
                  title="Role Assignment" 
                  subtitle="Change employee access level (Admin only)" 
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {['staff', 'maintenance', 'hr', 'admin'].map(role => (
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
                      <span className="uppercase text-sm">{role}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            
            {/* Danger Zone */}
            {isAdmin && (
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
