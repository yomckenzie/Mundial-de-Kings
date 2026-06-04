import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/lib/db';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => db.getCurrentUser());
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!db.getCurrentUser());
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const stored = db.getCurrentUser();
    if (stored && !user) {
      setUser(stored);
      setIsAuthenticated(true);
    } else if (!stored) {
      setIsAuthenticated(false);
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = useCallback((shouldRedirect = true) => {
    db.setCurrentUserEmail(null);
    setUser(null);
    setIsAuthenticated(false);
    localStorage.removeItem('chessking_token');
    if (shouldRedirect) {
      window.location.href = '/';
    }
  }, []);

  const navigateToLogin = useCallback(() => {
    window.location.href = '/login';
  }, []);

  const refreshUser = useCallback(() => {
    const current = db.getCurrentUser();
    setUser(current);
    setIsAuthenticated(!!current);
    return current;
  }, []);

  const value = useMemo(() => ({
    user,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings: false,
    authError,
    appPublicSettings: null,
    authChecked,
    logout,
    navigateToLogin,
    checkUserAuth: refreshUser,
    checkAppState: () => {},
    refreshUser,
  }), [user, isAuthenticated, isLoadingAuth, authError, authChecked, logout, navigateToLogin, refreshUser]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};