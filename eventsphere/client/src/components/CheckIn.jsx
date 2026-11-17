import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api.js';
import { dateLong } from '../utils/format.js';
import CameraScanner from './CameraScanner.jsx';
import { parseScan, verifyScan, offlineDecision, canVerify } from '../utils/gateQr.js';

// Short beep + vibration so gate staff do not have to look at the screen for every guest
let audioCtx;
function signal(result) {
  try { navigator.vibrate?.(result === 'ok' ? 80 : [120, 60, 120]); } catch { /* not supported */ }
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    audioCtx ||= new Ctx();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = result === 'ok' ? 880 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + (result === 'ok' ? 0.12 : 0.35));
  } catch { /* sound is a nice-to-have */ }
}

/**
 * Gate check-in for organizers and gate staff.
 * Three ways to enter a code: phone/laptop camera, a USB/Bluetooth scanner, or typing.
 * Offline-capable: download the ticket list, validate locally when offline, sync later.
 */
export default function CheckIn({ event, onChange }) {
  const key = `es_manifest_${event._id}`;
  const queueKey = `es_queue_${event._id}`;
  const [manifest, setManifest] = useState(() => JSON.parse(localStorage.getItem(key) || 'null'));
  const [queue, setQueue] = useState(() => JSON.parse(localStorage.getItem(queueKey) || '[]'));
  const gateKeyName = `es_gatekey_${event._id}`;
  const [gateKey, setGateKey] = useState(() => JSON.parse(localStorage.getItem(gateKeyName) || 'null'));
  const [offline, setOffline] = useState(!navigator.onLine);
  const [gate, setGate] = useState(() => localStorage.getItem('es_gate_name') || 'Gate 1');
  const [code, setCode] = useState('');
  const [last, setLast] = useState(null);
  const [log, setLog] = useState([]);
  const [camera, setCamera] = useState(false);
  const [notice, setNotice] = useState('');
  const inputRef = useRef(null);
  const working = useRef(false);

  useEffect(() => { localStorage.setItem(queueKey, JSON.stringify(queue)); }, [queue, queueKey]);

  // The event's public signing key: lets this device confirm a ticket is genuine while offline.
  // Fetched whenever we are online and remembered on the device.
  const saveGateKey = (jwk) => {
    if (!jwk) return;
    localStorage.setItem(gateKeyName, JSON.stringify(jwk));
    setGateKey(jwk);
  };
  useEffect(() => {
    api.get(`/tickets/gate/${event._id}`).then((r) => saveGateKey(r.data.gateKey)).catch(() => {});
  }, [event._id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem('es_gate_name', gate); }, [gate]);

  async function download() {
    setNotice('');
    try {
      const { data } = await api.get(`/tickets/manifest/${event._id}`);
      localStorage.setItem(key, JSON.stringify(data));
      setManifest(data);
      saveGateKey(data.gateKey);
    } catch (err) {
      setNotice(`Could not download the ticket list: ${errMsg(err)}`);
    }
  }

  async function sync() {
    if (!queue.length) return;
    setNotice('');
    try {
      const { data } = await api.post('/tickets/checkin/sync', { eventId: event._id, scans: queue });
      setQueue([]);
      setLog((l) => [...data.results.map((r) => ({ ...r, synced: true })), ...l].slice(0, 50));
      await download();
      onChange?.();
    } catch (err) {
      setNotice(`Sync failed - your scans are still saved on this device: ${errMsg(err)}`);
    }
  }

  // No internet: decide on this device, using the ticket's signature and the downloaded list
  async function localCheck(scan) {
    const verified = await verifyScan(scan, gateKey);
    const { accept, ...r } = offlineDecision({ scan, verified, eventId: event._id, manifest, queue });
    if (accept) setQueue((q) => [...q, { code: scan.code, gate, at: new Date().toISOString() }]);
    return r;
  }

  // One entry point for the camera, a handheld scanner and typing
  async function processCode(raw) {
    const scan = parseScan(raw);
    if (!scan.code || working.current) return;
    working.current = true;
    try {
      let r;
      if (offline) r = await localCheck(scan);
      else {
        try {
          r = (await api.post('/tickets/checkin', { eventId: event._id, code: scan.raw, gate })).data;
        } catch (err) {
          // No answer from the server = network dropped mid-event -> decide on this device instead
          if (err.response) r = { code: scan.code, result: 'invalid', message: errMsg(err) };
          else r = await localCheck(scan);
        }
      }
      signal(r.result);
      setLast(r);
      setLog((l) => [r, ...l].slice(0, 50));
      if (r.result === 'ok' && !r.offline) onChange?.();
    } finally {
      working.current = false;
    }
  }

  async function submit(e) {
    e.preventDefault();
    await processCode(code);
    setCode('');
    inputRef.current?.focus();
  }

  async function undo(entry) {
    setNotice('');
    try {
      if (entry.offline) setQueue((q) => q.filter((s) => s.code !== entry.code));
      else await api.post(`/tickets/${entry.ticketId}/undo-checkin`);
      setLog((l) => l.map((x) => (x === entry ? { ...x, undone: true } : x)));
      if (last === entry) setLast(null);
      if (!entry.offline) onChange?.();
    } catch (err) {
      setNotice(`Could not undo: ${errMsg(err)}`);
    }
  }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="row between">
          <h4 className="no-margin">Gate scanner</h4>
          <label className="check small"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /> Offline mode</label>
        </div>
        <label>Gate<input value={gate} onChange={(e) => setGate(e.target.value)} /></label>

        <button type="button" className={`btn block ${camera ? 'ghost' : 'accent'}`} onClick={() => setCamera((v) => !v)}>
          {camera ? 'Stop camera' : 'Scan with camera'}
        </button>
        {camera && <CameraScanner onScan={processCode} />}

        {last && (
          <div className={`scan-result ${last.result}`} role="status">
            <b>{last.result === 'ok' ? '✓ Welcome' : last.result === 'duplicate' ? '⚠ Already checked in' : '✕ Invalid ticket'}</b>
            <div>{last.holderName} {last.ticketTypeName && `· ${last.ticketTypeName}`}</div>
            {last.message && <div className="small">{last.message}</div>}
            {last.offline && last.result === 'ok' && <div className="tiny">Saved offline — sync when back online</div>}
          </div>
        )}

        <form onSubmit={submit}>
          <label>Or type the ticket code / use a USB or Bluetooth scanner
            <input ref={inputRef} autoFocus={!camera} value={code} onChange={(e) => setCode(e.target.value)} placeholder="ES-XXXXXXXXXX" />
          </label>
          <button className="btn ghost block">Check in</button>
        </form>
      </div>

      <div className="card">
        <h4>Offline kit</h4>
        <p className="small muted">
          {manifest ? `${manifest.tickets.length} tickets downloaded ${dateLong(manifest.downloadedAt)}` : 'No ticket list on this device yet. Download it before the doors open so scanning keeps working without internet.'}
        </p>
        <div className="row gap wrap">
          <button className="btn ghost sm" onClick={download}>Download ticket list</button>
          <button className="btn sm" disabled={!queue.length} onClick={sync}>Sync {queue.length} offline scans</button>
        </div>
        <p className={`small ${gateKey && canVerify() ? 'ok-text' : 'muted'}`}>
          {gateKey && canVerify()
            ? '✓ Signature check ready: this device can confirm a ticket is genuine with no internet, even one sold after the list was downloaded.'
            : !canVerify()
              ? 'Signature check is not available on this address (it needs https). Offline scanning will rely on the downloaded list only.'
              : 'Signature check: open this screen once while online to prepare this device.'}
        </p>
        {notice && <div className="alert error">{notice}</div>}
        <h4>Recent scans</h4>
        <div className="scan-log">
          {log.map((r, i) => (
            <div key={i} className={`small ${r.result} ${r.undone ? 'undone' : ''}`}>
              {r.result === 'ok' ? '✓' : r.result === 'duplicate' ? '⚠' : '✕'} {r.code} {r.holderName && `· ${r.holderName}`} {r.synced && '(synced)'}
              {r.undone && ' (undone)'}
              {r.result === 'ok' && !r.undone && !r.synced && (r.ticketId || r.offline) && (
                <button type="button" className="link-btn tiny undo-btn" onClick={() => undo(r)}>Undo</button>
              )}
            </div>
          ))}
          {!log.length && <p className="muted small">Scans from this device appear here.</p>}
        </div>
      </div>
    </div>
  );
}
