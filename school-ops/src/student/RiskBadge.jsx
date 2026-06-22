// Maps the 5 SIS risk tiers onto the app's existing badge color idiom
// (matches AdminView status/priority badges). Labels come from sis/riskTiers.ts.

import React from 'react';
import { STUDENT_RISK_LABELS } from '../sis/riskTiers';

const RISK_BADGE_STYLES = {
  critical: 'bg-red-600 text-white',
  attendance_risk: 'bg-red-50 text-red-700 border border-red-100',
  slipping: 'bg-amber-50 text-amber-700 border border-amber-100',
  hidden_gem: 'bg-indigo-50 text-indigo-700 border border-indigo-100',
  on_track: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
};

export default function RiskBadge({ tier }) {
  const style = RISK_BADGE_STYLES[tier] || 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${style}`}>
      {STUDENT_RISK_LABELS[tier] || tier || 'Unknown'}
    </span>
  );
}
