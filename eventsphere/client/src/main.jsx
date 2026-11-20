import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { PwaInstallProvider } from './context/PwaInstallContext.jsx';
import { LanguageProvider } from './context/LanguageContext.jsx';
import './pwa.js';
import './styles.css';

// Google Translate moves text into its own tags. React then crashes on the next
// update because the text is no longer a direct child. Skip those moves instead.
if (typeof Node === 'function' && !Node.prototype.__esTranslateGuard) {
  const removeChild = Node.prototype.removeChild;
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child);
  };
  Node.prototype.insertBefore = function (node, reference) {
    if (reference && reference.parentNode !== this) return node;
    return insertBefore.call(this, node, reference);
  };
  Node.prototype.__esTranslateGuard = true;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <PwaInstallProvider>
              <App />
            </PwaInstallProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
);
