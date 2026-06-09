// Layout: sidebar + mobile menu shell. Navigation is URL-driven via NavLink;
// the active state derives from the current route, not from local state.
// All role-based visibility goes through canSeeRoleView() — do not add
// role-string checks here. See CLAUDE.md rules #2 and #7.

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { actorFrom, can, canSeeRoleView } from './permissions';
import { ROLES, ROLE_LABELS } from './constants';
import { queryClient } from './data/queryClient';
import { useUnreadCount } from './data/useNotifications';
import { LogOut, Menu, X, Users, Bell, Crown, Settings, ShieldCheck } from 'lucide-react';

import logo from './assets/LogoT.png';

// ---------------------------------------------------------------------------
// One-shot Head Admin self-bootstrap banner.
// Visible ONLY for the designated principal (azizbr@gmail.com) while they
// still hold a non-super_admin role. After successful promotion the banner
// vanishes automatically because the role check no longer matches.
// Remove this component once the principal is promoted in production.
// ---------------------------------------------------------------------------
const BOOTSTRAP_EMAIL = 'azizbr@gmail.com';

function HeadAdminBootstrapBanner({ userData }) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);

  if (!userData) return null;
  const email = String(userData.email || '').toLowerCase();
  if (email !== BOOTSTRAP_EMAIL) return null;
  if (userData.role === 'super_admin') return null;

  const handleClick = async () => {
    setBusy(true); setMsg(null);
    try {
      const fn = httpsCallable(functions, 'bootstrapSuperAdmin');
      const res = await fn({ email });
      setMsg(res.data?.message || 'Promoted.');
      // Force a fresh user-doc read on next render.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      setMsg('Failed: ' + (err?.message || String(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 text-amber-900">
        <Crown size={20} />
        <div className="text-sm">
          <p className="font-semibold">One-time setup — promote yourself to Head Admin</p>
          <p className="text-amber-700">You are signed in as the designated principal. Click to elevate your role to <code className="px-1 bg-amber-100 rounded">super_admin</code>.</p>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-sm font-bold rounded-lg disabled:opacity-50"
        >
          {busy ? 'Promoting…' : 'Promote me'}
        </button>
        {msg && <span className="text-xs text-amber-800">{msg}</span>}
      </div>
    </div>
  );
}

const navItems = [
  { to: '/',                 label: 'Submit New Ticket', view: 'staff'       },
  { to: '/maintenance',      label: 'View Tickets',      view: 'maintenance' },
  { to: '/hr',               label: 'HR Dashboard',      view: 'hr'          },
  { to: '/admin',            label: 'Admin System',      view: 'admin'       },
];

// Head Admin chip is indigo, every other role stays neutral slate.
const ROLE_CHIP_STYLES = {
  [ROLES.SUPER_ADMIN]: 'bg-indigo-700 text-white',
};

function RoleChip({ role }) {
  if (!role) return null;
  const style = ROLE_CHIP_STYLES[role] || 'bg-slate-200 text-slate-600';
  return (
    <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${style}`}>
      {ROLE_LABELS[role] || role}
    </span>
  );
}

function NavItem({ to, label, mobile, onNavigate }) {
  // `end` ensures the index route only highlights at exactly "/", not for every
  // subpath.
  const end = to === '/';
  const baseClass = mobile
    ? 'p-3 rounded-lg text-sm font-medium text-left w-full block'
    : 'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full block';

  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${baseClass} ${isActive
          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
          : 'text-slate-600 hover:bg-slate-50'} ${mobile && 'border'}`
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout({
  children,
  user,
  userData,
  onSignOut,
  onLoginClick,
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
  const navigate = useNavigate();

  const isRealUser = user && !user.isAnonymous;
  const actor = actorFrom(userData);
  const unreadCount = useUnreadCount(isRealUser ? actor : null);

  const closeMobile = () => setIsMobileMenuOpen(false);

  // Shared computers: wipe every cached query (HR data, users, settings) so
  // nothing survives a user switch after sign-out.
  const handleSignOut = async () => {
    await onSignOut();
    queryClient.clear();
  };

  const visibleNavItems = navItems.filter(item => canSeeRoleView(actor, item.view));
  const canSeeDirectory = canSeeRoleView(actor, 'maintenance');
  const canReadSettings = can(actor, 'settings.read');
  const canManageAdmins = can(actor, 'user.manageAdmins');
  const showAdministration = canReadSettings || canManageAdmins;
  const roleKey = actor?.role || userData?.role;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex flex-col w-72 bg-white border-r border-slate-200 h-screen sticky top-0">
        <div className="p-6 border-b border-slate-100 flex flex-col items-center">
          {logo ? (
            <img src={logo} alt="Al Fajer School" className="h-20 w-auto mb-4 object-contain" />
          ) : (
            <div className="h-20 w-20 bg-indigo-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-indigo-600 font-bold text-lg">AFS</span>
            </div>
          )}
          <h1 className="text-lg font-bold text-slate-800 text-center leading-tight">
            Support &<br/><span className="text-indigo-600">Maintenance</span>
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {isRealUser ? (
            <>
              <div className="mb-6">
                <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Ticket System
                </p>
                <div className="flex flex-col gap-1">
                  {visibleNavItems.map(item => (
                    <NavItem key={item.to} to={item.to} label={item.label} />
                  ))}
                </div>
              </div>

              {canSeeDirectory && (
                <div className="mb-4">
                  <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    HR System
                  </p>
                  <NavLink
                    to="/staff-directory"
                    className={({ isActive }) =>
                      `text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Users size={16} className="inline mr-2" />
                    Staff Directory
                  </NavLink>
                </div>
              )}

              {showAdministration && (
                <div className="mb-4">
                  <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Administration
                  </p>
                  {canReadSettings && (
                    <NavLink
                      to="/settings"
                      className={({ isActive }) =>
                        `text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <Settings size={16} className="inline mr-2" />
                      School Settings
                    </NavLink>
                  )}
                  {canManageAdmins && (
                    <NavLink
                      to="/admin-management"
                      className={({ isActive }) =>
                        `text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <ShieldCheck size={16} className="inline mr-2" />
                      Admin Management
                    </NavLink>
                  )}
                </div>
              )}

              <div className="mb-4">
                <p className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  My Account
                </p>
                <NavLink
                  to="/notifications"
                  className={({ isActive }) =>
                    `text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center justify-between ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <span className="flex items-center">
                    <Bell size={16} className="inline mr-2" />
                    Notifications
                  </span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded-full min-w-[18px] text-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </NavLink>
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    `text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full flex items-center ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`
                  }
                >
                  <Users size={16} className="inline mr-2" />
                  My Profile
                </NavLink>
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
                  {userData?.displayName || userData?.email?.split('@')[0]}
                </p>
                <RoleChip role={roleKey} />
              </div>
            </div>
            <button
              onClick={handleSignOut}
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
          <button onClick={() => { navigate('/'); closeMobile(); }} className="flex items-center gap-3">
            {logo ? (
              <img src={logo} alt="Logo" className="h-10 w-auto" />
            ) : (
              <span className="h-8 w-8 bg-indigo-100 rounded flex items-center justify-center">
                <span className="text-indigo-600 font-bold text-sm">AFS</span>
              </span>
            )}
            <span className="font-bold text-slate-800">AFS Ops</span>
          </button>
          <div className="flex items-center gap-2">
            {isRealUser && <RoleChip role={roleKey} />}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {isMobileMenuOpen && (
          <div className="absolute top-full left-0 right-0 bg-white border-b border-slate-200 shadow-xl p-4 flex flex-col gap-4 animate-in slide-in-from-top-2">
            {isRealUser ? (
              <>
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Ticket System</p>
                  <div className="grid grid-cols-1 gap-2">
                    {visibleNavItems.map(item => (
                      <NavItem key={item.to} to={item.to} label={item.label} mobile onNavigate={closeMobile} />
                    ))}
                  </div>
                </div>

                {canSeeDirectory && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">HR System</p>
                    <NavLink
                      to="/staff-directory"
                      onClick={closeMobile}
                      className={({ isActive }) =>
                        `p-3 rounded-lg text-sm font-medium text-left w-full flex items-center gap-2 ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`
                      }
                    >
                      <Users size={16} /> Staff Directory
                    </NavLink>
                  </div>
                )}

                {showAdministration && (
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Administration</p>
                    {canReadSettings && (
                      <NavLink
                        to="/settings"
                        onClick={closeMobile}
                        className={({ isActive }) =>
                          `p-3 rounded-lg text-sm font-medium text-left w-full flex items-center gap-2 ${
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`
                        }
                      >
                        <Settings size={16} /> School Settings
                      </NavLink>
                    )}
                    {canManageAdmins && (
                      <NavLink
                        to="/admin-management"
                        onClick={closeMobile}
                        className={({ isActive }) =>
                          `p-3 rounded-lg text-sm font-medium text-left w-full flex items-center gap-2 ${
                            isActive
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`
                        }
                      >
                        <ShieldCheck size={16} /> Admin Management
                      </NavLink>
                    )}
                  </div>
                )}

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">My Account</p>
                  <NavLink
                    to="/notifications"
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      `p-3 rounded-lg text-sm font-medium text-left w-full flex items-center justify-between gap-2 ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <span className="flex items-center gap-2"><Bell size={16} /> Notifications</span>
                    {unreadCount > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500 text-white rounded-full min-w-[18px] text-center">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                  </NavLink>
                  <NavLink
                    to="/profile"
                    onClick={closeMobile}
                    className={({ isActive }) =>
                      `p-3 rounded-lg text-sm font-medium text-left w-full flex items-center gap-2 ${
                        isActive
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`
                    }
                  >
                    <Users size={16} /> My Profile
                  </NavLink>
                </div>

                <button
                  onClick={() => { handleSignOut(); closeMobile(); }}
                  className="flex items-center justify-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg font-medium"
                >
                  <LogOut size={18} /> Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => { onLoginClick(); closeMobile(); }}
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
          <HeadAdminBootstrapBanner userData={userData} />
          {children}
        </div>
      </main>

    </div>
  );
}
