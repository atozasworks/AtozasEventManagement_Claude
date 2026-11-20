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

/** Google Translate reads the googtrans cookie on load (`/en/hi`). */
export function writeTranslateCookie(code) {
  const expire = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
  const host = window.location.hostname;
  const clear = (domain) => {
    document.cookie = `googtrans=;path=/;${expire}${domain ? `;domain=${domain}` : ''}`;
  };
  clear();
  clear(host);
  if (host.includes('.')) clear(`.${host}`);
  if (code && code !== 'en') {
    document.cookie = `googtrans=/en/${code};path=/`;
  }
}
