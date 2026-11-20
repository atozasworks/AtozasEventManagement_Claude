import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api.js';
import EventCard from '../components/EventCard.jsx';
import { CATEGORIES, FORMATS } from '../utils/format.js';

const PAGE_SIZE = 24;

const labelOf = (value) => value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export default function Events() {
  const [params, setParams] = useSearchParams();
  const filters = {
    q: params.get('q') || '',
    city: params.get('city') || '',
    category: params.get('category') || '',
    format: params.get('format') || '',
    price: params.get('price') || '',
    when: params.get('when') || 'all',
    sort: params.get('sort') || 'date',
    page: Math.max(1, Number(params.get('page')) || 1),
  };
  const [cities, setCities] = useState([]);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/events/cities').then((r) => setCities(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true);
      const query = {
        q: filters.q,
        city: filters.city,
        category: filters.category,
        format: filters.format,
        price: filters.price,
        when: filters.when,
        sort: filters.sort,
        page: filters.page,
        limit: PAGE_SIZE,
      };
      const sent = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== '' && v != null));
      api
        .get('/events', { params: sent })
        .then((r) => { setData(r.data); setError(''); })
        .catch((e) => setError(errMsg(e)))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [filters.q, filters.city, filters.category, filters.format, filters.price, filters.when, filters.sort, filters.page]);

  const setFilter = (patch) => {
    const next = { ...filters, page: 1, ...patch };
    const out = {};
    if (next.q) out.q = next.q;
    if (next.city) out.city = next.city;
    if (next.category) out.category = next.category;
    if (next.format) out.format = next.format;
    if (next.price) out.price = next.price;
    if (next.when && next.when !== 'all') out.when = next.when;
    if (next.sort && next.sort !== 'date') out.sort = next.sort;
    if (next.page > 1) out.page = String(next.page);
    setParams(out);
  };

  const clear = () => setParams({});
  const hasFilters = Boolean(filters.q || filters.city || filters.category || filters.format || filters.price || filters.when !== 'all' || filters.sort !== 'date');

  return (
    <div className="page">
      <div className="section-head">
        <div>
          <h1>All events</h1>
          <p className="muted">Search every published event, then narrow by city, type, format or price.</p>
        </div>
        {hasFilters && <button type="button" className="btn ghost sm" onClick={clear}>Clear filters</button>}
      </div>

      <div className="filter-bar card events-filters">
        <label>Search
          <input value={filters.q} placeholder="Title, topic or city" onChange={(e) => setFilter({ q: e.target.value })} />
        </label>
        <label>City
          <select value={filters.city} onChange={(e) => setFilter({ city: e.target.value })}>
            <option value="">Any city</option>
            {cities.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>Category
          <select value={filters.category} onChange={(e) => setFilter({ category: e.target.value })}>
            <option value="">Any category</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{labelOf(c)}</option>)}
          </select>
        </label>
        <label>Format
          <select value={filters.format} onChange={(e) => setFilter({ format: e.target.value })}>
            <option value="">Any format</option>
            {FORMATS.map((f) => <option key={f} value={f}>{labelOf(f)}</option>)}
          </select>
        </label>
        <label>When
          <select value={filters.when} onChange={(e) => setFilter({ when: e.target.value })}>
            <option value="all">All dates</option>
            <option value="upcoming">Upcoming</option>
            <option value="past">Past</option>
          </select>
        </label>
        <label>Sort
          <select value={filters.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            <option value="date">Soonest first</option>
            <option value="popular">Most popular</option>
            <option value="new">Newly added</option>
          </select>
        </label>
      </div>

      <div className="filter-row">
        {['free', 'paid'].map((p) => (
          <button key={p} type="button" className={`chip-btn ${filters.price === p ? 'on' : ''}`} onClick={() => setFilter({ price: filters.price === p ? '' : p })}>{p}</button>
        ))}
      </div>

      {error && <div className="alert error">Couldn't load events: {error}. Check that the API server is running.</div>}
      <p className="muted small">{loading ? 'Loading events' : `${data.total} event${data.total === 1 ? '' : 's'} found`}</p>
      <div className="grid">
        {data.items.map((event) => <EventCard key={event._id} event={event} />)}
      </div>
      {!loading && !data.items.length && !error && (
        <div className="empty">No events match these filters. Clear a filter or try another city.</div>
      )}
      {data.pages > 1 && (
        <div className="row pager">
          <button type="button" className="btn ghost sm" disabled={filters.page <= 1} onClick={() => setFilter({ page: filters.page - 1 })}>Previous</button>
          <span className="small muted">Page {filters.page} of {data.pages}</span>
          <button type="button" className="btn ghost sm" disabled={filters.page >= data.pages} onClick={() => setFilter({ page: filters.page + 1 })}>Next</button>
        </div>
      )}
    </div>
  );
}
