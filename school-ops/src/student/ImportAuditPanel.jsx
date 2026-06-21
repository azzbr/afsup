// Renders the per-sheet import audit + write counts returned by
// importStudentWorkbook (or a persisted sis_import_batches doc). Counts/column
// metadata only — never names or scores.

import React from 'react';
import { FileSpreadsheet } from 'lucide-react';

function Stat({ label, value }) {
  return (
    <div>
      <dt className="text-slate-400 text-xs">{label}</dt>
      <dd className="font-medium text-slate-700 break-words">{value}</dd>
    </div>
  );
}

export default function ImportAuditPanel({ sheets, counts }) {
  const sheetEntries = sheets ? Object.entries(sheets) : [];
  return (
    <div className="space-y-4">
      {counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(counts).map(([key, value]) => (
            <div key={key} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-lg font-bold text-slate-800">{value}</p>
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                {key.replace(/([A-Z])/g, ' $1')}
              </p>
            </div>
          ))}
        </div>
      )}

      {sheetEntries.map(([name, audit]) => (
        <div key={name} className="bg-white rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileSpreadsheet size={16} className="text-indigo-600" />
            <h4 className="font-bold text-slate-800">{name}</h4>
          </div>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <Stat label="Header row" value={audit.headerRowExcel} />
            <Stat label="Students" value={audit.students} />
            <Stat label="Subjects" value={(audit.subjectsDetected || []).length} />
            <Stat label="Name column" value={audit.nameColumn} />
          </dl>
          {(audit.subjectsDetected || []).length > 0 && (
            <p className="text-xs text-slate-500 mt-3">{(audit.subjectsDetected || []).join(' · ')}</p>
          )}
          {(audit.attendanceDetected || []).length > 0 && (
            <p className="text-xs text-slate-400 mt-1">Attendance: {(audit.attendanceDetected || []).join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}
