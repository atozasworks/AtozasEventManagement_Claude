import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('es_token')) return setReady(true);
    api
      .get('/auth/me')
      .then((r) => setUser(r.data.user))
      .catch(() => localStorage.removeItem('es_token'))
      .finally(() => setReady(true));
  }, []);

  const saveSession = ({ token, user: u }) => {
    localStorage.setItem('es_token', token);
    setUser(u);
    return u;
  };

  const login = async (email, password) => saveSession((await api.post('/auth/login', { email, password })).data);
  const register = async (data) => saveSession((await api.post('/auth/register', data)).data);
  const becomeOrganizer = async (organizationName) =>
    saveSession((await api.post('/auth/become-organizer', { organizationName })).data);
  const logout = () => {
    localStorage.removeItem('es_token');
    setUser(null);
  };

  const isOrganizer = user && ['organizer', 'admin'].includes(user.role);

  return (
    <AuthContext.Provider value={{ user, ready, login, register, logout, becomeOrganizer, isOrganizer }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
