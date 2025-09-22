import React, { useEffect, useState } from 'react';
import { uploadAttachments, listAttachments, deleteAttachment } from '../api/attachments';

export function AttachmentsPanel({ expenseId }) {
  const [files, setFiles] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  async function refresh() { const d = await listAttachments(expenseId); setRows(d); }
  useEffect(() => { refresh(); }, [expenseId]);

  async function onUpload() {
    if (!files.length) return;
    setLoading(true);
    try { await uploadAttachments(expenseId, files); setFiles([]); await refresh(); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input type="file" accept="image/jpeg,image/png" multiple onChange={(e)=>setFiles(Array.from(e.target.files ?? []))} />
        <button className="btn primary" disabled={loading || !files.length} onClick={onUpload}>Upload</button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {rows.map(a => (
          <div key={a.id} className="border rounded-xl p-2">
            <img src={a.url} alt="receipt" style={{ width:'100%', height:128, objectFit:'cover', borderRadius:12 }} />
            <div className="text-xs" style={{ color:'#64748b', marginTop:4 }}>{(a.size_bytes/1024).toFixed(1)} KB</div>
            <button className="btn xs danger" style={{ marginTop:8 }} onClick={() => deleteAttachment(a.id).then(refresh)}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
