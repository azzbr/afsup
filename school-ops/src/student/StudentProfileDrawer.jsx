// Per-student profile drawer — per-subject multi-year trajectory (from the raw
// academic records), overall, Progress Index, attendance, and risk tier. Mirrors
// the AdminView detail-modal markup. Read-only.

import React, { useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useStudentRecords } from '../data/useStudentRecords';
import RiskBadge from './RiskBadge';
import { fmtPct, fmtPi, piColor, scoreToHeat, isNum } from './format';

export default function StudentProfileDrawer({ actor, student, onClose }) {
  const { data: records = [], isLoading } = useStudentRecords(actor, student?.studentId);

  const years = useMemo(() => [...new Set(records.map((r) => r.year))].sort(), [records]);
  const subjects = useMemo(() => [...new Set(records.map((r) => r.subject))].sort(), [records]);
  const cellByKey = useMemo(() => {
    const m = new Map();
    for (const r of records) {
      if (!isNum(r.score)) continue;
      const k = `${r.subject}|${r.year}`;
      const e = m.get(k) || { sum: 0, n: 0 };
      e.sum += r.score;
      e.n += 1;
      m.set(k, e);
    }
    return m;
  }, [records]);
  const cell = (subject, year) => {
    const e = cellByKey.get(`${subject}|${year}`);
    return e ? e.sum / e.n : null;
  };

  if (!student) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-800">{student.name || `Student #${student.studentId}`}</h3>
            <p className="text-sm text-slate-500 mt-0.5">
              ID {student.studentId}
              {student.grade != null && <> · Grade {student.grade}{student.section || ''}</>}
            </p>
            <div className="mt-2">{student.tier && <RiskBadge tier={student.tier} />}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors" aria-label="Close">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Overall</p>
              <p className="text-xl font-bold text-slate-800">{fmtPct(student.overall)}</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Progress Index</p>
              <p className={`text-xl font-bold ${piColor(student.progressIndex)}`}>{fmtPi(student.progressIndex)}</p>
            </div>
            <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Absences</p>
              <p className="text-xl font-bold text-slate-800">{isNum(student.daysAbsent) ? student.daysAbsent : '—'}</p>
            </div>
          </div>

          {student.signals && (
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-600">Signals:</span> {student.signals}
            </p>
          )}

          <div>
            <h4 className="font-bold text-slate-800 mb-2">Per-subject trajectory</h4>
            {isLoading ? (
              <div className="flex items-center gap-2 text-slate-400 py-6">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading records…
              </div>
            ) : subjects.length === 0 ? (
              <p className="text-sm text-slate-400">No subject records found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border border-slate-200 px-3 py-2 bg-slate-50 text-left font-semibold text-slate-500">Subject</th>
                      {years.map((y) => (
                        <th key={y} className="border border-slate-200 px-3 py-2 bg-slate-50 font-semibold text-slate-500">{y}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subjects.map((subject) => (
                      <tr key={subject}>
                        <td className="border border-slate-200 px-3 py-2 font-medium text-slate-700">{subject}</td>
                        {years.map((y) => {
                          const v = cell(subject, y);
                          return (
                            <td key={y} className={`border border-slate-200 px-3 py-2 text-center font-semibold ${scoreToHeat(v)}`}>
                              {isNum(v) ? v.toFixed(1) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button onClick={onClose} className="px-6 py-2 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
