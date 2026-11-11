import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api, { errMsg } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import { time } from '../utils/format.js';

const REACTIONS = ['👏', '🔥', '❤️', '😂', '🎉'];

function toEmbed(url) {
  if (!url) return '';
  const yt = url.match(/(?:youtu\.be\/|v=|\/live\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`;
  return url;
}

function Stage({ event }) {
  const { user } = useAuth();
  const sessions = event.sessions || [];
  const [active, setActive] = useState(sessions[0]?._id || 'main');
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [asQuestion, setAsQuestion] = useState(false);
  const [count, setCount] = useState(0);
  const [floating, setFloating] = useState([]);
  const [status, setStatus] = useState('connecting');
  const socketRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const s = io({ auth: { token: localStorage.getItem('es_token') } });
    socketRef.current = s;
    s.on('connect', () => setStatus('live'));
    s.on('connect_error', () => setStatus('offline'));
    s.on('message', (m) => setMessages((prev) => [...prev, m].slice(-200)));
    s.on('presence', ({ count: c }) => setCount(c));
    s.on('reaction', ({ emoji }) => {
      const id = Math.random();
      setFloating((f) => [...f, { id, emoji, left: 10 + Math.random() * 80 }]);
      setTimeout(() => setFloating((f) => f.filter((x) => x.id !== id)), 2200);
    });
    return () => s.disconnect();
  }, []);

  useEffect(() => {
    const room = active || 'main';
    api.get(`/networking/events/${event._id}/chat/${room}`).then((r) => setMessages(r.data)).catch(() => setMessages([]));
    const join = () => socketRef.current?.emit('join', { eventId: event._id, room });
    if (socketRef.current?.connected) join();
    socketRef.current?.on('connect', join);
    return () => socketRef.current?.off('connect', join);
  }, [active, event._id]);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [messages]);

  const session = sessions.find((s) => s._id === active);
  const embed = toEmbed(session?.streamUrl);

  function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    socketRef.current.emit('message', { text, kind: asQuestion ? 'question' : 'chat' });
    setText('');
    setAsQuestion(false);
  }

  return (
    <div className="stage-layout">
      <div>
        <div className="player">
          {embed ? (
            <iframe src={embed} title="Live stream" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          ) : (
            <div className="player-empty">
              <div className="pulse-dot" />
              <h3>{session ? session.title : 'Main stage'}</h3>
              <p className="muted">The stream will appear here when it goes live.</p>
              <p className="tiny muted">Organizers: add a YouTube Live / Vimeo URL to this session in the event editor.</p>
            </div>
          )}
          <div className="floating">
            {floating.map((f) => <span key={f.id} style={{ left: `${f.left}%` }}>{f.emoji}</span>)}
          </div>
        </div>
        <div className="row between reactions">
          <div>{REACTIONS.map((r) => <button key={r} onClick={() => socketRef.current.emit('reaction', { emoji: r })}>{r}</button>)}</div>
          <span className="small muted">● {count} watching · {status}</span>
        </div>
        <h3>Sessions</h3>
        <div className="session-list">
          {sessions.map((s) => (
            <button key={s._id} className={`session-btn ${active === s._id ? 'on' : ''}`} onClick={() => setActive(s._id)}>
              <span className="session-time">{time(s.startTime)}</span>
              <span><b>{s.title}</b><br /><span className="muted small">{s.speaker} · {s.track}</span></span>
            </button>
          ))}
        </div>
      </div>
      <div className="chat card">
        <h4>Live chat & Q&A</h4>
        <div className="chat-list" ref={listRef}>
          {messages.map((m) => (
            <div key={m._id} className={`msg ${m.kind} ${m.user === user._id ? 'me' : ''}`}>
              <b>{m.name}</b> {m.kind === 'question' && <span className="pill tiny">Q</span>}
              <div>{m.text}</div>
            </div>
          ))}
          {!messages.length && <p className="muted small">Say hello 👋</p>}
        </div>
        <form onSubmit={send}>
          <input placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row between">
            <label className="check small"><input type="checkbox" checked={asQuestion} onChange={(e) => setAsQuestion(e.target.checked)} /> Ask as question</label>
            <button className="btn sm">Send</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Expo({ event }) {
  const [booths, setBooths] = useState([]);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get(`/expo/events/${event._id}/booths`).then((r) => setBooths(r.data));
  }, [event._id]);

  function visit(b) {
    setOpen(b);
    setMsg('');
    api.post(`/expo/booths/${b._id}/visit`).catch(() => {});
  }
  async function share(b) {
    try {
      const { data } = await api.post(`/expo/booths/${b._id}/leads`, {});
      setMsg(data.alreadyShared ? 'You already shared your details.' : `Your contact details were shared with ${b.sponsorName}.`);
    } catch (e) {
      setMsg(errMsg(e));
    }
  }

  if (!booths.length) return <div className="empty">No exhibitors yet.</div>;
  return (
    <>
      <div className="booth-grid">
        {booths.map((b) => (
          <button key={b._id} className={`booth ${b.tier}`} onClick={() => visit(b)}>
            <span className="pill tiny">{b.tier}</span>
            <div className="booth-logo">{b.sponsorName.slice(0, 2).toUpperCase()}</div>
            <b>{b.sponsorName}</b>
            <span className="muted small">{b.physicalLocation}</span>
          </button>
        ))}
      </div>
      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{open.sponsorName}</h2>
            <p>{open.description}</p>
            {open.physicalLocation && <p className="small">On-site: <b>{open.physicalLocation}</b></p>}
            {open.resources?.map((r) => <p key={r.url}><a href={r.url} target="_blank" rel="noreferrer">📄 {r.title}</a></p>)}
            {open.website && <p><a href={open.website} target="_blank" rel="noreferrer">Visit website ↗</a></p>}
            {msg && <div className="alert info">{msg}</div>}
            <div className="row gap">
              <button className="btn" onClick={() => share(open)}>Share my contact</button>
              <button className="btn ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Networking({ event }) {
  const [people, setPeople] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [error, setError] = useState('');

  const load = () => {
    api.get(`/networking/events/${event._id}/people`).then((r) => setPeople(r.data)).catch((e) => setError(errMsg(e)));
    api.get(`/networking/events/${event._id}/connections`).then((r) => setContacts(r.data)).catch(() => {});
  };
  useEffect(load, [event._id]);

  const connect = async (p) => { await api.post(`/networking/events/${event._id}/connections`, { to: p._id }); load(); };
  const respond = async (id, status) => { await api.put(`/networking/connections/${id}`, { status }); load(); };

  if (error) return <div className="alert error">{error}</div>;
  return (
    <div className="two-col">
      <div>
        <h3>People at this event</h3>
        <div className="people">
          {people.map((p) => (
            <div key={p._id} className="person card">
              <div className="avatar">{p.name[0]}</div>
              <div className="grow">
                <b>{p.name}</b>
                <div className="muted small">{p.headline || p.organizationName}</div>
                <div className="tags">{p.interests?.map((i) => <span key={i} className="tag">{i}</span>)}</div>
              </div>
              {!p.connection && <button className="btn sm" onClick={() => connect(p)}>Connect</button>}
              {p.connection?.status === 'pending' && !p.connection.incoming && <span className="pill subtle">Requested</span>}
              {p.connection?.status === 'pending' && p.connection.incoming && (
                <div className="row gap">
                  <button className="btn sm" onClick={() => respond(p.connection.id, 'accepted')}>Accept</button>
                  <button className="btn ghost sm" onClick={() => respond(p.connection.id, 'declined')}>Ignore</button>
                </div>
              )}
              {p.connection?.status === 'accepted' && <span className="pill ok">Connected</span>}
            </div>
          ))}
          {!people.length && <p className="muted">No other attendees have opted into networking yet.</p>}
        </div>
      </div>
      <aside className="card">
        <h3>My connections</h3>
        {contacts.map((c) => (
          <div key={c._id} className="small contact">
            <b>{c.name}</b><br /><a href={`mailto:${c.email}`}>{c.email}</a>
          </div>
        ))}
        {!contacts.length && <p className="muted small">Accepted connections share email addresses here.</p>}
      </aside>
    </div>
  );
}

export default function VirtualVenue() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [tab, setTab] = useState('stage');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/events/${id}`).then((r) => setEvent(r.data)).catch((e) => setError(errMsg(e)));
  }, [id]);

  if (error) return <div className="page"><div className="alert error">{error}</div></div>;
  if (!event) return <div className="page"><div className="spinner" /></div>;
  if (!event.hasTicket) {
    return (
      <div className="page narrow">
        <div className="card center">
          <h2>Register to join online</h2>
          <Link className="btn" to={`/e/${event.slug}`}>Get a ticket</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page wide">
      <div className="row between">
        <div>
          <p className="eyebrow dark">Virtual venue</p>
          <h1 className="no-margin">{event.title}</h1>
        </div>
        <Link to={`/e/${event.slug}`} className="btn ghost sm">Event page</Link>
      </div>
      <div className="tabs">
        <button className={tab === 'stage' ? 'on' : ''} onClick={() => setTab('stage')}>Stage</button>
        {event.modules?.expo && <button className={tab === 'expo' ? 'on' : ''} onClick={() => setTab('expo')}>Expo hall</button>}
        {event.modules?.networking && <button className={tab === 'net' ? 'on' : ''} onClick={() => setTab('net')}>Networking</button>}
      </div>
      {tab === 'stage' && <Stage event={event} />}
      {tab === 'expo' && <Expo event={event} />}
      {tab === 'net' && <Networking event={event} />}
    </div>
  );
}
