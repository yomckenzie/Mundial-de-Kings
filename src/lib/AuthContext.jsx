import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { db } from '@/lib/db';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const stored = db.getCurrentUser();
    if (stored) {
      setUser(stored);
      setIsAuthenticated(true);
    } else {
      setIsAuthenticated(false);
    }
    setIsLoadingAuth(false);
    setAuthChecked(true);
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

  return (
    <AuthContext.Provider value={{
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
    }}>
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