import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('es_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errMsg = (err) => err?.response?.data?.message || err?.message || 'Something went wrong';

// ---- UTM attribution: remember the first-touch campaign for this browser session ----
export function captureAttribution() {
  const p = new URLSearchParams(window.location.search);
  if (p.get('utm_source') && !sessionStorage.getItem('es_attr')) {
    sessionStorage.setItem(
      'es_attr',
      JSON.stringify({
        source: p.get('utm_source'),
        medium: p.get('utm_medium') || undefined,
        campaign: p.get('utm_campaign') || undefined,
        referrer: document.referrer || undefined,
      })
    );
  }
}

export function getAttribution() {
  try {
    return JSON.parse(sessionStorage.getItem('es_attr')) || { referrer: document.referrer || undefined };
  } catch {
    return {};
  }
}

export default api;
