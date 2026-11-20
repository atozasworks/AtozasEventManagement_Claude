import { useState } from 'react';
import api, { errMsg } from '../api.js';

export default function ImageUpload({ label, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('image', file);
      const { data } = await api.post('/uploads', body);
      onChange(data.url);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="image-upload">
      <span>{label}</span>
      {value ? <div className="image-upload-preview" style={{ backgroundImage: `url(${value})` }} /> : null}
      <div className="row gap wrap">
        <label key={busy ? 'uploading' : value ? 'change' : 'upload'} className="btn ghost sm">
          {busy ? 'Uploading…' : value ? 'Change photo' : 'Upload photo'}
          <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden disabled={busy} onChange={onFile} />
        </label>
        {value ? <button type="button" className="link-btn" onClick={() => onChange('')}>Remove</button> : null}
      </div>
      <p className="muted tiny">JPG, PNG, WEBP or GIF, up to 5 MB.</p>
      {error ? <div className="alert error">{error}</div> : null}
    </div>
  );
}
