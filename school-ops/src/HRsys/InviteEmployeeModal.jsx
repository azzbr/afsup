// HR-facing modal for inviting a new employee. Calls the `inviteUser` Cloud
// Function and surfaces the generated invite URL so the admin can either
// (a) confirm SendGrid mailed it, or (b) copy and share the link manually.

import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { X, Mail, UserPlus, Loader2, Copy, CheckCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';

import { functions } from '../firebase';
import {
  ROLES, DEPARTMENTS, DEPARTMENT_LABELS, CONTRACT_TYPES, CONTRACT_TYPE_LABELS,
} from '../constants';
import { actorFrom, assignableRoles } from '../permissions';

export default function InviteEmployeeModal({ isOpen, onClose, userData }) {
  const actor = actorFrom(userData);
  const roles = assignableRoles(actor);
  const defaultRole = roles.includes('staff') ? 'staff' : roles[0] ?? '';

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState(defaultRole);

  // Phase 2.5 optional employment details — collapsed by default so the
  // common case (just email + role) stays a fast one-screen flow.
  const [showEmployment, setShowEmployment] = useState(false);
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [contractType, setContractType] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [employeeNumber, setEmployeeNumber] = useState('');
  const [isTeacher, setIsTeacher] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { inviteUrl, emailSent }
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const reset = () => {
    setEmail(''); setFirstName(''); setMiddleName(''); setLastName('');
    setRole(defaultRole); setError(null); setResult(null); setCopied(false);
    setShowEmployment(false); setPosition(''); setDepartment('');
    setContractType(''); setContractStartDate(''); setEmployeeNumber('');
    setIsTeacher(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !role) {
      setError('All fields except middle name are required.');
      return;
    }
    if (!roles.includes(role)) {
      setError(`You are not allowed to assign the '${role}' role.`);
      return;
    }

    setSubmitting(true);
    try {
      const callable = httpsCallable(functions, 'inviteUser');
      const appBaseUrl = window.location.origin;
      const res = await callable({
        email: email.trim(),
        role,
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        appBaseUrl,
        // Phase 2.5 — only send if user filled the optional section
        position: position.trim() || undefined,
        department: department || undefined,
        contractType: contractType || undefined,
        contractStartDate: contractStartDate || undefined,
        employeeNumber: employeeNumber.trim() || undefined,
        isTeacher: isTeacher || undefined,
      });
      setResult(res.data);
    } catch (err) {
      console.error('inviteUser failed', err);
      setError(err.message || 'Failed to send invitation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async () => {
    if (!result?.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Clipboard write failed', err);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700">
              <UserPlus size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Invite New Employee</h3>
              <p className="text-xs text-slate-500">They'll receive a link to set their password.</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-slate-200 rounded-full text-slate-400">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <CheckCircle size={22} />
                <div className="text-sm">
                  <p className="font-semibold">Invitation created</p>
                  <p className="text-emerald-600">
                    {result.emailSent
                      ? 'An email has been sent to the invitee.'
                      : 'Email not sent (SendGrid not configured). Copy the link below and share it manually.'}
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Invite link</label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={result.inviteUrl}
                    onClick={(e) => e.target.select()}
                    className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-bold hover:bg-slate-800 flex items-center gap-1"
                  >
                    {copied ? <CheckCircle size={14} /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1">Link expires in 7 days.</p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 rounded-xl font-medium hover:bg-slate-50"
                >
                  Invite another
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 bg-red-50 text-red-700 p-3 rounded-lg text-sm border border-red-200">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">First Name *</label>
                  <input
                    type="text" required
                    value={firstName} onChange={e => setFirstName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Last Name *</label>
                  <input
                    type="text" required
                    value={lastName} onChange={e => setLastName(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Middle Name (Optional)</label>
                <input
                  type="text"
                  value={middleName} onChange={e => setMiddleName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Work Email *</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 text-slate-400 w-5 h-5" />
                  <input
                    type="email" required
                    placeholder="name@afs.edu.bh"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Role *</label>
                <select
                  value={role} onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {roles.map(r => (
                    <option key={r} value={r}>
                      {r === ROLES.STAFF ? 'Staff / Teacher' :
                       r === ROLES.MAINTENANCE ? 'Maintenance' :
                       r === ROLES.HR ? 'HR' :
                       r === ROLES.ADMIN ? 'Administrator' : r}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  You can assign any role you have permission for.
                </p>
              </div>

              {/* Optional employment details — collapsed by default */}
              <div className="border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEmployment(s => !s)}
                  className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase hover:text-slate-700"
                >
                  {showEmployment ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  Employment Details (optional)
                </button>
                {showEmployment && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Position</label>
                        <input
                          type="text"
                          placeholder="e.g. Math Teacher"
                          value={position} onChange={e => setPosition(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
                        <select
                          value={department} onChange={e => setDepartment(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">—</option>
                          {DEPARTMENTS.map(d => (
                            <option key={d} value={d}>{DEPARTMENT_LABELS[d]}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Contract Type</label>
                        <select
                          value={contractType} onChange={e => setContractType(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">—</option>
                          {CONTRACT_TYPES.map(c => (
                            <option key={c} value={c}>{CONTRACT_TYPE_LABELS[c]}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
                        <input
                          type="date"
                          value={contractStartDate} onChange={e => setContractStartDate(e.target.value)}
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Employee Number</label>
                      <input
                        type="text"
                        placeholder="e.g. AFS-0142"
                        value={employeeNumber} onChange={e => setEmployeeNumber(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isTeacher}
                        onChange={e => setIsTeacher(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300"
                      />
                      This employee teaches (will show teacher-specific fields in their profile)
                    </label>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting ? 'Sending Invitation…' : 'Send Invitation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
