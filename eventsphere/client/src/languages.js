/** Languages offered through the Google Translate website widget. The page source stays English. */

export const LANGUAGES = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr', label: 'Marathi', native: 'मराठी' },
  { code: 'bn', label: 'Bengali', native: 'বাংলা' },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
  { code: 'ur', label: 'Urdu', native: 'اردو' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
  { code: 'zh-CN', label: 'Chinese', native: '中文' },
];

const KEY = 'es_lang';

export function isLanguage(code) {
  return LANGUAGES.some((item) => item.code === code);
}

export function readLanguage() {
  try {
    const saved = localStorage.getItem(KEY);
    return isLanguage(saved) ? saved : 'en';
  } catch {
    return 'en';
  }
}

export function languageShort(code) {
  return String(code || 'en').slice(0, 2).toUpperCase();
}

/** Host plus parent domains. Google writes googtrans on more than one of these. */
export function translateCookieDomains(host = window.location.hostname) {
  const domains = [''];
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return domains;
  domains.push(host, `.${host}`);
  const parts = host.split('.');
  for (let i = 1; i < parts.length - 1; i += 1) domains.push(`.${parts.slice(i).join('.')}`);
  return [...new Set(domains)];
}

/** Google Translate reads the googtrans cookie on load (`/en/hi`). English means no cookie. */
export function writeTranslateCookie(code) {
  const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  for (const domain of translateCookieDomains()) {
    document.cookie = `googtrans=;path=/;${expire}${domain ? `;domain=${domain}` : ''}`;
  }
  if (code && code !== 'en') document.cookie = `googtrans=/en/${code};path=/`;
}

export function saveLanguage(code) {
  const next = isLanguage(code) ? code : 'en';
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* the cookie still carries the choice for this reload */
  }
  writeTranslateCookie(next);
  return next;
}
