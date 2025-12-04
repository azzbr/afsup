import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { NATIONALITIES, BAHRAIN_BANKS } from '../constants';
import {
  Search, Filter, Users, User, Mail, Phone, MapPin, Building2,
  Calendar, CreditCard, FileText, Shield, ChevronRight, ChevronDown,
  Briefcase, Globe, Heart, AlertTriangle, CheckCircle, Clock,
  BadgeCheck, UserCircle, Download, Printer, X, Eye, MoreVertical,
  SortAsc, SortDesc, Grid3X3, List, Loader2
} from 'lucide-react';

// ============================================================================
// STATUS & ROLE BADGES
// ============================================================================

const StatusBadge = ({ status }) => {
  const styles = {
    approved: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle },
    pending: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock },
    suspended: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: AlertTriangle },
    terminated: { bg: 'bg-slate-100', text: 'text-slate-500', border: 'border-slate-200', icon: X }
  };
  const style = styles[status] || styles.pending;
  const Icon = style.icon;
  
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${style.bg} ${style.text} ${style.border}`}>
      <Icon size={12} />
      {status?.charAt(0).toUpperCase() + status?.slice(1) || 'Unknown'}
    </span>
  );
};

const RoleBadge = ({ role }) => {
  const styles = {
    admin: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Admin' },
    hr: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'HR' },
    maintenance: { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Maint.' },
    staff: { bg: 'bg-slate-100', text: 'text-slate-700', label: 'Staff' }
  };
  const style = styles[role] || styles.staff;
  
  return (
    <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide whitespace-nowrap ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
};

// ============================================================================
// EMPLOYEE CARD COMPONENT (Grid View)
// ============================================================================

const EmployeeCard = ({ employee, onClick, isSelected }) => {
  const initials = `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const hasComplianceIssue = checkComplianceStatus(employee);
  
  return (
    <div
      onClick={() => onClick(employee)}
      className={`group relative bg-white rounded-2xl border-2 transition-all duration-200 cursor-pointer overflow-hidden flex flex-col min-h-[320px]
        ${isSelected 
          ? 'border-indigo-500 ring-4 ring-indigo-100 shadow-lg' 
          : 'border-slate-200 hover:border-indigo-300 hover:shadow-md'
        }`}
    >
      {/* Compliance Alert Indicator */}
      {hasComplianceIssue && (
        <div className="absolute top-3 right-3 z-10">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" title="Compliance Issue" />
        </div>
      )}
      
      {/* Header Gradient */}
      <div className="h-14 bg-gradient-to-br from-slate-100 via-slate-50 to-indigo-50 shrink-0" />
      
      {/* Avatar */}
      <div className="flex justify-center -mt-8 shrink-0">
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold shadow-lg border-4 border-white
          ${employee.status === 'approved' 
            ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' 
            : 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
          }`}>
          {initials}
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4 pt-2 text-center flex-1 flex flex-col">
        <h3 className="font-bold text-slate-900 text-base leading-tight line-clamp-2">
          {employee.displayName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unnamed'}
        </h3>
        
        <p className="text-slate-500 text-xs mt-1 truncate px-2" title={employee.email}>
          {employee.email}
        </p>
        
        {/* Badges - Stacked vertically */}
        <div className="flex flex-col items-center gap-1.5 mt-3">
          <RoleBadge role={employee.role} />
          <StatusBadge status={employee.status} />
        </div>
        
        {/* Quick Info */}
        <div className="mt-auto pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
          <div className="text-left">
            <p className="text-slate-400 uppercase tracking-wide text-[10px]">Nationality</p>
            <p className="text-slate-700 font-medium truncate">{employee.nationality || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 uppercase tracking-wide text-[10px]">CPR</p>
            <p className="text-slate-700 font-medium font-mono text-xs">{employee.cprNumber || '—'}</p>
          </div>
        </div>
        
        {/* Phone - Always shown for consistent height */}
        <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 h-5">
          {employee.phoneNumber ? (
            <>
              <Phone size={12} />
              <span>{employee.phoneNumber}</span>
            </>
          ) : (
            <span className="text-slate-300">—</span>
          )}
        </div>
      </div>
      
      {/* Hover Footer */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-indigo-600 to-indigo-500 text-white py-2 px-3 translate-y-full group-hover:translate-y-0 transition-transform duration-200 flex items-center justify-center gap-2 text-sm font-medium">
        <Eye size={14} />
        View Profile
      </div>
    </div>
  );
};

// ============================================================================
// EMPLOYEE ROW COMPONENT (Table View)
// ============================================================================

const EmployeeRow = ({ employee, onClick, isSelected, canManage }) => {
  const initials = `${employee.firstName?.[0] || ''}${employee.lastName?.[0] || ''}`.toUpperCase() || 'U';
  const hasComplianceIssue = checkComplianceStatus(employee);
  
  return (
    <tr
      onClick={() => onClick(employee)}
      className={`group cursor-pointer transition-colors
        ${isSelected 
          ? 'bg-indigo-50' 
          : 'hover:bg-slate-50'
        }`}
    >
      {/* Employee Info */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0
            ${employee.status === 'approved' 
              ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' 
              : 'bg-gradient-to-br from-slate-400 to-slate-500 text-white'
            }`}>
            {initials}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900 truncate">
                {employee.displayName || `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || 'Unnamed'}
              </p>
              {hasComplianceIssue && (
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" title="Compliance Issue" />
              )}
            </div>
            <p className="text-sm text-slate-500 truncate">{employee.email}</p>
          </div>
        </div>
      </td>
      
      {/* Role & Status */}
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1.5">
          <RoleBadge role={employee.role} />
          <StatusBadge status={employee.status} />
        </div>
      </td>
      
      {/* Nationality */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Globe size={14} className="text-slate-400" />
          {employee.nationality || '—'}
        </div>
      </td>
      
      {/* CPR */}
      <td className="px-4 py-4">
        <span className="font-mono text-sm text-slate-700">
          {employee.cprNumber || '—'}
        </span>
      </td>
      
      {/* Phone */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Phone size={14} className="text-slate-400" />
          {employee.phoneNumber || '—'}
        </div>
      </td>
      
      {/* Date of Joining */}
      <td className="px-4 py-4">
        <div className="flex items-center gap-2 text-sm text-slate-700">
          <Calendar size={14} className="text-slate-400" />
          {employee.dateOfJoining?.toDate 
            ? employee.dateOfJoining.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            : '—'
          }
        </div>
      </td>
      
      {/* Actions */}
      <td className="px-4 py-4">
        <button className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100">
          <ChevronRight size={18} />
        </button>
      </td>
    </tr>
  );
};

// ============================================================================
// COMPLIANCE CHECK HELPER
// ============================================================================

function checkComplianceStatus(employee) {
  const now = new Date();
  const threeMonths = new Date();
  threeMonths.setMonth(now.getMonth() + 3);
  
  // Check CPR Expiry
  if (employee.cprExpiry?.toDate) {
    const expiry = employee.cprExpiry.toDate();
    if (expiry < threeMonths) return true;
  }
  
  // Check Visa Expiry (Non-Bahrainis)
  if (employee.nationality !== 'Bahraini' && employee.residencePermitExpiry?.toDate) {
    const expiry = employee.residencePermitExpiry.toDate();
    if (expiry < threeMonths) return true;
  }
  
  // Check Missing IBAN
  if (!employee.iban || !employee.iban.startsWith('BH')) return true;
  
  return false;
}

// ============================================================================
// FILTER SIDEBAR
// ============================================================================

const FilterSidebar = ({ filters, setFilters, employees }) => {
  const roleOptions = [
    { value: 'all', label: 'All Roles' },
    { value: 'admin', label: 'Administrators' },
    { value: 'hr', label: 'HR Managers' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'staff', label: 'Staff' }
  ];
  
  const statusOptions = [
    { value: 'all', label: 'All Status' },
    { value: 'approved', label: 'Active' },
    { value: 'pending', label: 'Pending Approval' },
    { value: 'suspended', label: 'Suspended' }
  ];
  
  const nationalityOptions = [
    { value: 'all', label: 'All Nationalities' },
    ...NATIONALITIES.map(n => ({ value: n, label: n }))
  ];
  
  // Calculate counts
  const counts = useMemo(() => {
    const c = { total: employees.length, approved: 0, pending: 0, suspended: 0, compliance: 0 };
    employees.forEach(e => {
      if (e.status === 'approved') c.approved++;
      if (e.status === 'pending') c.pending++;
      if (e.status === 'suspended') c.suspended++;
      if (checkComplianceStatus(e)) c.compliance++;
    });
    return c;
  }, [employees]);
  
  return (
    <div className="space-y-6">
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
          <p className="text-2xl font-bold text-emerald-700">{counts.approved}</p>
          <p className="text-xs text-emerald-600 font-medium">Active</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
          <p className="text-2xl font-bold text-amber-700">{counts.pending}</p>
          <p className="text-xs text-amber-600 font-medium">Pending</p>
        </div>
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
          <p className="text-2xl font-bold text-slate-700">{counts.total}</p>
          <p className="text-xs text-slate-500 font-medium">Total Staff</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4 border border-red-100">
          <p className="text-2xl font-bold text-red-700">{counts.compliance}</p>
          <p className="text-xs text-red-600 font-medium">Alerts</p>
        </div>
      </div>
      
      {/* Filter by Role */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Role
        </label>
        <select
          value={filters.role}
          onChange={(e) => setFilters({ ...filters, role: e.target.value })}
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          {roleOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      
      {/* Filter by Status */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Status
        </label>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          {statusOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      
      {/* Filter by Nationality */}
      <div>
        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
          Nationality
        </label>
        <select
          value={filters.nationality}
          onChange={(e) => setFilters({ ...filters, nationality: e.target.value })}
          className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          {nationalityOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>
      
      {/* Compliance Filter */}
      <div>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={filters.complianceOnly}
            onChange={(e) => setFilters({ ...filters, complianceOnly: e.target.checked })}
            className="w-5 h-5 text-red-600 border-slate-300 rounded focus:ring-red-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-700 group-hover:text-red-600 transition-colors">
              Compliance Issues Only
            </p>
            <p className="text-xs text-slate-400">Show employees with alerts</p>
          </div>
        </label>
      </div>
      
      {/* Reset Filters */}
      <button
        onClick={() => setFilters({ role: 'all', status: 'all', nationality: 'all', complianceOnly: false })}
        className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors font-medium"
      >
        Reset All Filters
      </button>
    </div>
  );
};

// ============================================================================
// MAIN HR DIRECTORY COMPONENT
// ============================================================================

export default function HRDirectory({ user, userData, onSelectEmployee }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'displayName', direction: 'asc' });
  const [showFilters, setShowFilters] = useState(true);
  const [filters, setFilters] = useState({
    role: 'all',
    status: 'all',
    nationality: 'all',
    complianceOnly: false
  });
  
  // Permission check
  const canManageUsers = ['admin', 'hr'].includes(userData?.role);
  
  // Load employees
  useEffect(() => {
    const loadEmployees = async () => {
      setLoading(true);
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        
        // Filter based on current user's role permissions
        const filtered = data.filter(emp => {
          const myRole = userData?.role;
          const targetRole = emp.role || 'staff';
          
          if (myRole === 'admin') return true;
          if (myRole === 'hr') return ['staff', 'maintenance', 'hr'].includes(targetRole);
          if (myRole === 'maintenance') return ['staff', 'maintenance'].includes(targetRole);
          return targetRole === 'staff';
        });
        
        setEmployees(filtered);
      } catch (error) {
        console.error('Error loading employees:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (userData) loadEmployees();
  }, [userData]);
  
  // Filter and search employees
  const filteredEmployees = useMemo(() => {
    let result = [...employees];
    
    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(emp => 
        emp.displayName?.toLowerCase().includes(query) ||
        emp.firstName?.toLowerCase().includes(query) ||
        emp.lastName?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.cprNumber?.includes(query) ||
        emp.phoneNumber?.includes(query)
      );
    }
    
    // Apply filters
    if (filters.role !== 'all') {
      result = result.filter(emp => emp.role === filters.role);
    }
    if (filters.status !== 'all') {
      result = result.filter(emp => emp.status === filters.status);
    }
    if (filters.nationality !== 'all') {
      result = result.filter(emp => emp.nationality === filters.nationality);
    }
    if (filters.complianceOnly) {
      result = result.filter(emp => checkComplianceStatus(emp));
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let aVal = a[sortConfig.key] || '';
      let bVal = b[sortConfig.key] || '';
      
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    return result;
  }, [employees, searchQuery, filters, sortConfig]);
  
  const handleEmployeeClick = (employee) => {
    setSelectedEmployee(employee);
    if (onSelectEmployee) onSelectEmployee(employee);
  };
  
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };
  
  // Loading State
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500 font-medium">Loading Staff Directory...</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex gap-6">
      {/* Filter Sidebar */}
      {showFilters && (
        <aside className="w-72 shrink-0">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sticky top-24">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <Filter size={18} className="text-indigo-600" />
                Filters
              </h3>
              <button
                onClick={() => setShowFilters(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X size={16} />
              </button>
            </div>
            <FilterSidebar 
              filters={filters} 
              setFilters={setFilters} 
              employees={employees}
            />
          </div>
        </aside>
      )}
      
      {/* Main Content */}
      <main className="flex-1 min-w-0">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, CPR, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-3">
              {!showFilters && (
                <button
                  onClick={() => setShowFilters(true)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <Filter size={16} />
                  Filters
                </button>
              )}
              
              {/* View Toggle */}
              <div className="flex bg-slate-100 rounded-xl p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <Grid3X3 size={18} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`p-2 rounded-lg transition-colors ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <List size={18} />
                </button>
              </div>
              
              {/* Export */}
              <button className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2">
                <Download size={16} />
                Export
              </button>
            </div>
          </div>
          
          {/* Results Count */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing <span className="font-bold text-slate-700">{filteredEmployees.length}</span> of {employees.length} employees
            </p>
            
            {/* Sort Options */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">Sort by:</span>
              <select
                value={sortConfig.key}
                onChange={(e) => handleSort(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="displayName">Name</option>
                <option value="email">Email</option>
                <option value="role">Role</option>
                <option value="dateOfJoining">Join Date</option>
              </select>
              <button
                onClick={() => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'asc' ? 'desc' : 'asc' }))}
                className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                {sortConfig.direction === 'asc' ? <SortAsc size={16} /> : <SortDesc size={16} />}
              </button>
            </div>
          </div>
        </div>
        
        {/* Content */}
        {filteredEmployees.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700 mb-2">No Employees Found</h3>
            <p className="text-slate-500">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredEmployees.map(emp => (
              <EmployeeCard
                key={emp.id}
                employee={emp}
                onClick={handleEmployeeClick}
                isSelected={selectedEmployee?.id === emp.id}
              />
            ))}
          </div>
        ) : (
          /* Table View */
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Employee</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Role & Status</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Nationality</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">CPR</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Joined</th>
                    <th className="text-left px-4 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredEmployees.map(emp => (
                    <EmployeeRow
                      key={emp.id}
                      employee={emp}
                      onClick={handleEmployeeClick}
                      isSelected={selectedEmployee?.id === emp.id}
                      canManage={canManageUsers}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
