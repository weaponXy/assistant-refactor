import React, { useEffect, useState } from 'react';
import { uploadAttachments, listAttachments, deleteAttachment } from '../api/attachments';
import '../stylecss/AttachmentPanel.css';


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
      <div className="attachments">
        <div className="attachments-grid">
          {rows.map(a => (
            <div key={a.id} className="attachment-card">
              <img src={a.url} alt="receipt" className="attachment-thumb" />
              <div className="attachment-meta">
                {(a.size_bytes/1024).toFixed(1)} KB
              </div>
              <div className="attachment-actions">
                <button
                  className="btn danger xs"
                  onClick={() => deleteAttachment(a.id).then(refresh)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
