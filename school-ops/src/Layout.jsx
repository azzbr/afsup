// Import ROLES to match App.jsx
import React from 'react';
import { ROLES } from './constants';
import {
  Wrench,
  ShieldAlert,
  Users,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  ClipboardList
} from 'lucide-react';

// Use the uploaded logo (Ensure this file exists in your assets folder)
import logo from './Logo.jpg';

export default function Layout({
  children,
  user,
  userData,
  activeRole,
  setActiveRole,
  onSignOut,
  onLoginClick
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  // CRITICAL FIX: Treat Anonymous users as "Guests" for the UI
  // We only show the "Logged In" UI if the user exists AND is NOT anonymous.
  const isRealUser = user && !user.isAnonymous;

  // Helper to determine if a role button should be shown
  const canViewRole = (targetRole) => {
    if (!userData) return false; // Data not loaded yet

    // Admin (Head Management) can see everything
    if (userData.viewAll) return true;

    // Maintenance can see Maintenance + Staff
    if (userData.role === 'maintenance') {
        return targetRole !== ROLES.ADMIN;
    }

    // Staff can only see Staff
    return targetRole === ROLES.STAFF;
  };

  const RoleButton = ({ role, mobile = false }) => {
    // Check visibility
    if (!canViewRole(role) && role !== ROLES.STAFF) return null;

    const isActive = activeRole === role;
    const baseClass = mobile
        ? "p-3 rounded-lg text-sm font-medium text-left w-full"
        : "text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full";

    const activeClass = isActive
        ? "bg-indigo-50 text-indigo-700 border-indigo-200"
        : "text-slate-600 hover:bg-slate-50";

    return (
        <button
            onClick={() => {
                setActiveRole(role);
                if (mobile) setIsMobileMenuOpen(false);
            }}
            className={`${baseClass} ${activeClass} ${mobile && isActive ? 'border' : ''}`}
        >
            {role}
        </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 h-screen sticky top-0">
        <div className="p-6 border-b border-slate-100 flex flex-col items-center">
          <img src={logo} alt="Al Fajer School" className="h-20 w-auto mb-4 object-contain" />
          <h1 className="text-lg font-bold text-slate-800 text-center leading-tight">
            Support &<br/><span className="text-indigo-600">Maintenance</span>
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {isRealUser ? (
            <>
              <div className="mb-6">
                <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Switch Role
                </p>
                <div className="flex flex-col gap-1">
                    <RoleButton role={ROLES.STAFF} />
                    <RoleButton role={ROLES.MAINTENANCE} />
                    <RoleButton role={ROLES.ADMIN} />
                </div>
              </div>
              <div className="h-px bg-slate-200 my-4 mx-3" />
            </>
          ) : (
            <div className="p-4 bg-indigo-50 rounded-xl mb-4">
              <p className="text-sm text-indigo-800 font-medium mb-2">Welcome Guest</p>
              <button
                onClick={onLoginClick}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                Login to System
              </button>
            </div>
          )}
        </nav>

        {isRealUser && (
          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs">
                {userData?.email?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">
                  {userData?.email?.split('@')[0]}
                </p>
                <p className="text-xs text-slate-500 truncate">
                  {activeRole}
                </p>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="flex items-center gap-2 text-slate-500 hover:text-red-600 text-sm font-medium transition-colors w-full"
            >
              <LogOut size={16} /> Sign Out
            </button>
          </div>
        )}
      </aside>

      {/* --- MOBILE HEADER --- */}
      <header className="md:hidden bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Logo" className="h-10 w-auto" />
            <span className="font-bold text-slate-800">AFS Ops</span>
          </div>
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu Dropdown */}
        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-xl p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
             {isRealUser ? (
               <>
                 <div>
                   <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Switch Role</p>
                   <div className="grid grid-cols-1 gap-2">
                        <RoleButton role={ROLES.STAFF} mobile={true} />
                        <RoleButton role={ROLES.MAINTENANCE} mobile={true} />
                        <RoleButton role={ROLES.ADMIN} mobile={true} />
                   </div>
                 </div>
                 <button
                   onClick={onSignOut}
                   className="flex items-center justify-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg font-medium"
                 >
                   <LogOut size={18} /> Sign Out
                 </button>
               </>
             ) : (
               <button
                 onClick={() => { onLoginClick(); setIsMobileMenuOpen(false); }}
                 className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium"
               >
                 Login / Register
               </button>
             )}
          </div>
        )}
      </header>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50/50">
        <div className="max-w-6xl mx-auto p-4 md:p-8">
          {children}
        </div>
      </main>

    </div>
  );
}
