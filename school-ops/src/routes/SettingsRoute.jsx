// /settings — School Settings page (Phase 2.6).
//
// HR/admin get a read-only view (settings.read); only Head Admin can edit
// (settings.edit). All writes go through the `updateSchoolSettings` callable,
// which validates permission server-side and stamps audit fields. The payload
// contains only the keys that changed, with dates as ISO yyyy-mm-dd strings.

import React from 'react';
import { httpsCallable } from 'firebase/functions';
import {
  Building2, CalendarRange, CalendarDays, Sun, Percent, Landmark, Mail,
  Plus, Trash2, Save, Loader2, BedDouble,
} from 'lucide-react';

import { functions } from '../firebase';
import { can } from '../permissions';
import { queryClient } from '../data/queryClient';
import { useSchoolSettings, effectiveSettings, SCHOOL_SETTINGS_KEY } from '../data/useSchoolSettings';
import { useRouteContext } from './guards';

const ALL_DAYS = [
  { key: 'sun', label: 'Sun' },
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
];

const inputClass =
  'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ' +
  'disabled:bg-slate-50 disabled:text-slate-500';

const toISODate = (d) => (d instanceof Date && !isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '');
const toPercentStr = (rate) =>
  typeof rate === 'number' && Number.isFinite(rate) ? String(Math.round(rate * 10000) / 100) : '';
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Flatten the (already default-merged) settings into string-based form state.
// Top-level keys here mirror the settings doc so change detection can send
// only the modified keys to the callable.
function toDraft(s) {
  return {
    schoolNameEn: s.schoolNameEn ?? '',
    schoolNameAr: s.schoolNameAr ?? '',
    domain: s.domain ?? '',
    academicYearStart: toISODate(s.academicYearStart),
    academicYearEnd: toISODate(s.academicYearEnd),
    workingDays: [...(s.workingDays ?? [])],
    publicHolidays: (s.publicHolidays ?? []).map((h) => ({
      date: toISODate(h.date),
      label: h.label ?? '',
    })),
    defaultAnnualLeaveDays: String(s.defaultAnnualLeaveDays ?? 30),
    sickLeaveTiers: {
      fullPay: String(s.sickLeaveTiers?.fullPay ?? ''),
      halfPay: String(s.sickLeaveTiers?.halfPay ?? ''),
      noPay: String(s.sickLeaveTiers?.noPay ?? ''),
    },
    gosi: {
      bahrainiEmployer: toPercentStr(s.gosi?.bahraini?.employerRate),
      bahrainiEmployee: toPercentStr(s.gosi?.bahraini?.employeeRate),
      expatEmployer: toPercentStr(s.gosi?.expat?.employerRate),
      expatEmployee: toPercentStr(s.gosi?.expat?.employeeRate),
    },
    wps: {
      employerCR: s.wps?.employerCR ?? '',
      bankRoutingCode: s.wps?.bankRoutingCode ?? '',
    },
    notifyOnCriticalCompliance: [...(s.notifyOnCriticalCompliance ?? [])],
  };
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
          <Icon size={18} />
        </div>
        <div>
          <h2 className="font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      {children}
    </label>
  );
}

export default function SettingsRoute() {
  const { actor } = useRouteContext();
  const canEdit = can(actor, 'settings.edit');

  const { data: settingsDoc, isLoading } = useSchoolSettings();
  const settings = effectiveSettings(settingsDoc);

  // Re-baseline the draft whenever the underlying doc changes (including
  // right after our own save, when the snapshot pushes the new values).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const baseline = React.useMemo(() => toDraft(settings), [settingsDoc]);
  const [draft, setDraft] = React.useState(baseline);
  React.useEffect(() => { setDraft(baseline); }, [baseline]);

  const [emailInput, setEmailInput] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState(null); // { type: 'success' | 'error', text }

  const changedKeys = React.useMemo(
    () => Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(baseline[k])),
    [draft, baseline],
  );
  const isDirty = changedKeys.length > 0;

  const patch = (partial) => setDraft((d) => ({ ...d, ...partial }));

  const toggleDay = (key) => {
    setDraft((d) => {
      const has = d.workingDays.includes(key);
      // Keep canonical sun..sat order regardless of click order.
      const next = ALL_DAYS.map((x) => x.key).filter((k) => (k === key ? !has : d.workingDays.includes(k)));
      return { ...d, workingDays: next };
    });
  };

  const weeklyOffDays = ALL_DAYS.map((d) => d.key).filter((k) => !draft.workingDays.includes(k));

  const addHoliday = () =>
    patch({ publicHolidays: [...draft.publicHolidays, { date: '', label: '' }] });
  const updateHoliday = (idx, hPatch) =>
    patch({ publicHolidays: draft.publicHolidays.map((h, i) => (i === idx ? { ...h, ...hPatch } : h)) });
  const removeHoliday = (idx) =>
    patch({ publicHolidays: draft.publicHolidays.filter((_, i) => i !== idx) });

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v || !v.includes('@') || draft.notifyOnCriticalCompliance.includes(v)) return;
    patch({ notifyOnCriticalCompliance: [...draft.notifyOnCriticalCompliance, v] });
    setEmailInput('');
  };
  const removeEmail = (v) =>
    patch({ notifyOnCriticalCompliance: draft.notifyOnCriticalCompliance.filter((e) => e !== v) });

  // Map changed draft keys back to the callable payload shape. Dates stay
  // ISO yyyy-mm-dd strings; GOSI percentages become 0..1 fractions.
  const buildPayload = () => {
    const payload = {};
    for (const key of changedKeys) {
      switch (key) {
        case 'schoolNameEn':
        case 'schoolNameAr':
        case 'domain':
          payload[key] = draft[key].trim();
          break;
        case 'academicYearStart':
        case 'academicYearEnd':
          // updateSchoolSettings rejects null (coerceTimestamp requires an
          // ISO string), so a cleared date input is omitted rather than
          // sent — dates cannot be cleared once set.
          if (draft[key]) payload[key] = draft[key];
          break;
        case 'workingDays':
          payload.workingDays = draft.workingDays;
          payload.weeklyOffDays = weeklyOffDays;
          break;
        case 'publicHolidays':
          payload.publicHolidays = draft.publicHolidays
            .filter((h) => h.date)
            .map((h) => ({ date: h.date, label: h.label.trim() }));
          break;
        case 'defaultAnnualLeaveDays':
          payload.defaultAnnualLeaveDays = num(draft.defaultAnnualLeaveDays);
          break;
        case 'sickLeaveTiers':
          payload.sickLeaveTiers = {
            fullPay: num(draft.sickLeaveTiers.fullPay),
            halfPay: num(draft.sickLeaveTiers.halfPay),
            noPay: num(draft.sickLeaveTiers.noPay),
          };
          break;
        case 'gosi':
          payload.gosi = {
            bahraini: {
              employerRate: num(draft.gosi.bahrainiEmployer) / 100,
              employeeRate: num(draft.gosi.bahrainiEmployee) / 100,
            },
            expat: {
              employerRate: num(draft.gosi.expatEmployer) / 100,
              employeeRate: num(draft.gosi.expatEmployee) / 100,
            },
          };
          break;
        case 'wps':
          payload.wps = {
            employerCR: draft.wps.employerCR.trim(),
            bankRoutingCode: draft.wps.bankRoutingCode.trim(),
          };
          break;
        case 'notifyOnCriticalCompliance':
          payload.notifyOnCriticalCompliance = draft.notifyOnCriticalCompliance;
          break;
        default:
          break;
      }
    }
    return payload;
  };

  const handleSave = async () => {
    if (!isDirty || saving) return;
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      // Every changed key was a cleared date — nothing the callable accepts.
      setSaveMsg({ type: 'error', text: 'Nothing to save: academic year dates cannot be cleared, only changed.' });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const call = httpsCallable(functions, 'updateSchoolSettings');
      await call(payload);
      queryClient.invalidateQueries({ queryKey: [...SCHOOL_SETTINGS_KEY] });
      setSaveMsg({ type: 'success', text: 'Settings saved.' });
    } catch (err) {
      setSaveMsg({ type: 'error', text: `Could not save settings: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-16 text-slate-400 text-sm">Loading settings…</div>;
  }

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900">School Settings</h1>
          <p className="text-slate-500 mt-1">
            {canEdit
              ? 'School-wide configuration. Changes apply across the whole platform.'
              : 'School-wide configuration (read-only). Only the Head Admin can edit these values.'}
          </p>
          {settings.updatedAt instanceof Date && (
            <p className="text-xs text-slate-400 mt-1">Last updated {settings.updatedAt.toLocaleDateString()}</p>
          )}
        </div>
        {canEdit && (
          <div className="flex items-center gap-3">
            {saveMsg && (
              <span className={`text-sm font-medium ${saveMsg.type === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                {saveMsg.text}
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-lg flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6">
        <Section icon={Building2} title="School Identity" description="Names and email domain.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Name (English)">
              <input
                type="text"
                value={draft.schoolNameEn}
                onChange={(e) => patch({ schoolNameEn: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Name (Arabic)">
              <input
                type="text"
                dir="rtl"
                value={draft.schoolNameAr}
                onChange={(e) => patch({ schoolNameAr: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Email Domain">
              <input
                type="text"
                value={draft.domain}
                onChange={(e) => patch({ domain: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section icon={CalendarRange} title="Academic Year" description="Start and end of the current academic year.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Year Starts">
              <input
                type="date"
                value={draft.academicYearStart}
                onChange={(e) => patch({ academicYearStart: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Year Ends">
              <input
                type="date"
                value={draft.academicYearEnd}
                onChange={(e) => patch({ academicYearEnd: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section icon={Sun} title="Week Structure" description="Toggle the days the school operates. Remaining days are the weekly off days.">
          <div className="flex flex-wrap gap-2 mb-3">
            {ALL_DAYS.map((day) => {
              const active = draft.workingDays.includes(day.key);
              return (
                <button
                  key={day.key}
                  type="button"
                  onClick={() => canEdit && toggleDay(day.key)}
                  disabled={!canEdit}
                  className={`px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${
                    active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-white border-slate-200 text-slate-500'
                  } ${canEdit ? 'hover:border-indigo-400' : 'cursor-default'}`}
                >
                  {day.label}
                </button>
              );
            })}
          </div>
          <p className="text-sm text-slate-500">
            Weekly off days:{' '}
            <span className="font-semibold text-slate-700">
              {weeklyOffDays.length > 0
                ? weeklyOffDays.map((k) => ALL_DAYS.find((d) => d.key === k)?.label).join(', ')
                : 'none'}
            </span>
          </p>
        </Section>

        <Section icon={CalendarDays} title="Public Holidays" description="Bahrain national and school holidays for the year.">
          <div className="space-y-2">
            {draft.publicHolidays.length === 0 && (
              <p className="text-sm text-slate-400">No holidays configured.</p>
            )}
            {draft.publicHolidays.map((h, idx) => (
              <div key={idx} className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={h.date}
                  onChange={(e) => updateHoliday(idx, { date: e.target.value })}
                  disabled={!canEdit}
                  className={`${inputClass} md:w-44 w-full`}
                />
                <input
                  type="text"
                  placeholder="Holiday name"
                  value={h.label}
                  onChange={(e) => updateHoliday(idx, { label: e.target.value })}
                  disabled={!canEdit}
                  className={`${inputClass} flex-1 min-w-[160px]`}
                />
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeHoliday(idx)}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    title="Remove holiday"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={addHoliday}
              className="mt-3 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1"
            >
              <Plus size={14} /> Add Holiday
            </button>
          )}
        </Section>

        <Section icon={BedDouble} title="Leave" description="Annual leave default and Bahrain sick-leave tiers (days per year).">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Annual Leave Days">
              <input
                type="number"
                min="0"
                value={draft.defaultAnnualLeaveDays}
                onChange={(e) => patch({ defaultAnnualLeaveDays: e.target.value })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Sick: Full Pay">
              <input
                type="number"
                min="0"
                value={draft.sickLeaveTiers.fullPay}
                onChange={(e) => patch({ sickLeaveTiers: { ...draft.sickLeaveTiers, fullPay: e.target.value } })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Sick: Half Pay">
              <input
                type="number"
                min="0"
                value={draft.sickLeaveTiers.halfPay}
                onChange={(e) => patch({ sickLeaveTiers: { ...draft.sickLeaveTiers, halfPay: e.target.value } })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Sick: No Pay">
              <input
                type="number"
                min="0"
                value={draft.sickLeaveTiers.noPay}
                onChange={(e) => patch({ sickLeaveTiers: { ...draft.sickLeaveTiers, noPay: e.target.value } })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section icon={Percent} title="GOSI Rates" description="Social insurance contribution rates, entered as percentages.">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { key: 'bahrainiEmployer', label: 'Bahraini: Employer %' },
              { key: 'bahrainiEmployee', label: 'Bahraini: Employee %' },
              { key: 'expatEmployer', label: 'Expat: Employer %' },
              { key: 'expatEmployee', label: 'Expat: Employee %' },
            ].map(({ key, label }) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.gosi[key]}
                  onChange={(e) => patch({ gosi: { ...draft.gosi, [key]: e.target.value } })}
                  disabled={!canEdit}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
        </Section>

        <Section icon={Landmark} title="WPS" description="Wage Protection System details for the LMRA CSV upload.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Employer CR Number">
              <input
                type="text"
                value={draft.wps.employerCR}
                onChange={(e) => patch({ wps: { ...draft.wps, employerCR: e.target.value } })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
            <Field label="Bank Routing Code">
              <input
                type="text"
                value={draft.wps.bankRoutingCode}
                onChange={(e) => patch({ wps: { ...draft.wps, bankRoutingCode: e.target.value } })}
                disabled={!canEdit}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>

        <Section icon={Mail} title="Compliance Notifications" description="Emails that receive critical compliance alerts.">
          <div className="flex flex-wrap gap-2 mb-3">
            {draft.notifyOnCriticalCompliance.length === 0 && (
              <p className="text-sm text-slate-400">No recipients configured.</p>
            )}
            {draft.notifyOnCriticalCompliance.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-full"
              >
                {email}
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeEmail(email)}
                    className="text-slate-400 hover:text-red-600"
                    title="Remove recipient"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2 max-w-md">
              <input
                type="email"
                placeholder="name@afs.edu.bh"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                className={inputClass}
              />
              <button
                type="button"
                onClick={addEmail}
                className="px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1 shrink-0"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
