import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import HRDirectory from './HRDirectory';
import EmployeeDetailView from './EmployeeDetailView';
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
  
  const criticalCount = alerts.filter(a => a.priority === 'critical').length;
  const warningCount = alerts.filter(a => a.priority === 'warning').length;
  
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
                    alert.priority === 'critical' 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {alert.msg}
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

const PendingApprovalsWidget = ({ users, onApprove, onViewUser }) => {
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
                <button
                  onClick={() => onApprove(user.id)}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 transition-colors"
                >
                  Approve
                </button>
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
                  {request.daysRequested} days • {request.leaveStart?.toDate?.()?.toLocaleDateString()} - {request.leaveEnd?.toDate?.()?.toLocaleDateString()}
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
// MAIN HR SYSTEM COMPONENT
// ============================================================================

export default function HRSystem({ user, userData }) {
  const [activeView, setActiveView] = useState('dashboard'); // 'dashboard', 'directory', 'employee'
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [complianceAlerts, setComplianceAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Permission check
  const canManage = ['admin', 'hr'].includes(userData?.role);
  
  // Load all data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load employees
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersData = usersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter based on permissions
        const filtered = usersData.filter(emp => {
          const myRole = userData?.role;
          const targetRole = emp.role || 'staff';
          
          if (myRole === 'admin') return true;
          if (myRole === 'hr') return ['staff', 'maintenance', 'hr'].includes(targetRole);
          if (myRole === 'maintenance') return ['staff', 'maintenance'].includes(targetRole);
          return targetRole === 'staff';
        });
        
        setEmployees(filtered);
        
        // Calculate compliance alerts
        const alerts = calculateComplianceAlerts(filtered);
        setComplianceAlerts(alerts);
        
        // Load pending leave requests
        try {
          const leaveQuery = query(
            collection(db, 'leave_requests'),
            where('status', '==', 'pending'),
            orderBy('submittedAt', 'desc')
          );
          const leaveSnapshot = await getDocs(leaveQuery);
          setLeaveRequests(leaveSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
          console.log('Leave requests collection may not exist yet:', e);
          setLeaveRequests([]);
        }
        
      } catch (error) {
        console.error('Error loading HR data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (userData) loadData();
  }, [userData]);
  
  // Calculate compliance alerts
  const calculateComplianceAlerts = (users) => {
    const alerts = [];
    const now = new Date();
    const threeMonths = new Date(); threeMonths.setMonth(now.getMonth() + 3);
    const oneMonth = new Date(); oneMonth.setMonth(now.getMonth() + 1);
    
    users.forEach(u => {
      // CPR Expiry
      if (u.cprExpiry?.toDate) {
        const expiry = u.cprExpiry.toDate();
        if (expiry < now) {
          alerts.push({ priority: 'critical', msg: `CPR Expired: ${u.displayName || u.email}`, employee: u });
        } else if (expiry < threeMonths) {
          alerts.push({ priority: 'warning', msg: `CPR Expiring: ${u.displayName || u.email}`, employee: u });
        }
      }
      
      // Visa Expiry
      if (u.nationality !== 'Bahraini' && u.residencePermitExpiry?.toDate) {
        const expiry = u.residencePermitExpiry.toDate();
        if (expiry < now) {
          alerts.push({ priority: 'critical', msg: `Visa Expired: ${u.displayName || u.email}`, employee: u });
        } else if (expiry < oneMonth) {
          alerts.push({ priority: 'warning', msg: `Visa Expiring: ${u.displayName || u.email}`, employee: u });
        }
      }
      
      // Missing IBAN
      if (!u.iban || !u.iban.startsWith('BH')) {
        alerts.push({ priority: 'info', msg: `Missing IBAN: ${u.displayName || u.email}`, employee: u });
      }
    });
    
    return alerts.sort((a, b) => {
      const order = { critical: 3, warning: 2, info: 1 };
      return order[b.priority] - order[a.priority];
    });
  };
  
  // Stats calculations
  const stats = {
    total: employees.length,
    active: employees.filter(e => e.status === 'approved').length,
    pending: employees.filter(e => e.status === 'pending').length,
    bahraini: employees.filter(e => e.nationality === 'Bahraini').length,
    expat: employees.filter(e => e.nationality !== 'Bahraini').length,
    alerts: complianceAlerts.filter(a => a.priority === 'critical').length
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
  
  const handleRefresh = async () => {
    setLoading(true);
    // Re-trigger the useEffect by forcing a state update
    setEmployees([]);
    setTimeout(() => window.location.reload(), 100);
  };
  
  // Quick approve handler
  const handleQuickApprove = async (userId) => {
    // This would call the approval function
    alert(`Approve user ${userId} - implement with updateDoc`);
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
          <button
            onClick={() => setActiveView('dashboard')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeView === 'dashboard' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Dashboard
          </button>
          <ChevronRight size={16} className="text-slate-300" />
          <button
            onClick={() => setActiveView('directory')}
            className={`px-3 py-1.5 rounded-lg transition-colors ${
              activeView === 'directory' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Staff Directory
          </button>
          {activeView === 'employee' && selectedEmployee && (
            <>
              <ChevronRight size={16} className="text-slate-300" />
              <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 font-medium rounded-lg">
                {selectedEmployee.displayName || selectedEmployee.email}
              </span>
            </>
          )}
        </div>
        
        <button
          onClick={handleRefresh}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          title="Refresh Data"
        >
          <RefreshCw size={18} />
        </button>
      </div>
      
      {/* DASHBOARD VIEW */}
      {activeView === 'dashboard' && (
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
              />
              
              <LeaveRequestsWidget
                requests={leaveRequests}
                onApprove={(req) => alert('Approve: ' + req.id)}
                onReject={(req) => alert('Reject: ' + req.id)}
              />
            </div>
            
            {/* Right Column - Analytics */}
            <div className="space-y-6">
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
                  <button className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl text-left transition-colors group">
                    <div className="flex items-center gap-3">
                      <FileText size={18} className="text-slate-400 group-hover:text-indigo-600" />
                      <span className="font-medium text-slate-700">Export HR Report</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
                  <button className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50 rounded-xl text-left transition-colors group">
                    <div className="flex items-center gap-3">
                      <Settings size={18} className="text-slate-400 group-hover:text-indigo-600" />
                      <span className="font-medium text-slate-700">HR Settings</span>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </button>
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
      
      {/* EMPLOYEE DETAIL VIEW */}
      {activeView === 'employee' && selectedEmployee && (
        <EmployeeDetailView
          employee={selectedEmployee}
          onClose={handleBackToDirectory}
          user={user}
          userData={userData}
          onUpdate={() => {
            // Refresh employee data
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
