// Import tab — Head Admin uploads a grade workbook, which is parsed + persisted
// server-side by importStudentWorkbook. The file goes to the admin-only
// sis-imports/{uid}/ Storage path; the function reads it via the Admin SDK and
// deletes it afterwards (PII never lingers, never parsed in the browser).

import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Upload, Loader2, CheckCircle, AlertCircle, ShieldAlert } from 'lucide-react';
import { functions } from '../firebase';
import { can } from '../permissions';
import { useImportBatches } from '../data/useImportBatches';
import ImportAuditPanel from './ImportAuditPanel';

const STATUS_STYLES = {
  completed: 'bg-emerald-50 text-emerald-700',
  processing: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
};

function StatusBadge({ status }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-500'}`}>
      {status || 'unknown'}
    </span>
  );
}

// Encode a File's bytes to base64 in chunks (avoids call-stack overflow on
// String.fromCharCode for larger files).
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function ImportTab({ actor }) {
  const canImport = can(actor, 'student.import');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { data: batches = [] } = useImportBatches(actor);

  if (!canImport) {
    return (
      <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
        <ShieldAlert size={40} className="mb-3 text-slate-300" />
        <p className="font-medium">Importing student data is restricted to the Head Admin.</p>
      </div>
    );
  }

  const handlePick = (e) => {
    setFile(e.target.files?.[0] ?? null);
    setResult(null);
    setError(null);
  };

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await httpsCallable(functions, 'importStudentWorkbook')({ fileBase64, fileName: file.name });
      setResult(res.data);
      setFile(null);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-1">Import grade workbook</h3>
        <p className="text-sm text-slate-500 mb-4">
          Upload the school&apos;s .xlsx workbook. Re-importing the same file is safe — records overwrite in place.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium cursor-pointer">
            <Upload size={16} /> {file ? file.name : 'Choose .xlsx'}
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePick} disabled={busy} />
          </label>
          <button
            onClick={handleImport}
            disabled={!file || busy}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Importing…
              </>
            ) : (
              'Import'
            )}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {result?.ok && (
          <div className="mt-5">
            <div className="flex items-center gap-2 text-emerald-700 mb-3">
              <CheckCircle size={18} />
              <span className="font-medium">Import complete.</span>
            </div>
            <ImportAuditPanel sheets={result.sheets} counts={result.counts} />
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 className="font-bold text-slate-800 mb-3">Recent imports</h3>
        {batches.length === 0 ? (
          <p className="text-sm text-slate-400">No imports yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {batches.map((b) => (
              <div key={b.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-700 truncate">{b.fileName || b.id}</span>
                <span className="flex items-center gap-3 text-slate-400 shrink-0">
                  <span>{b.createdAt ? b.createdAt.toLocaleString() : ''}</span>
                  <StatusBadge status={b.status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
