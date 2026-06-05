import React, { createContext, useContext, useEffect, useCallback, useMemo, useReducer } from 'react';
import { db } from '@/lib/db';

const AuthContext = createContext();

const initialState = () => ({
  user: db.getCurrentUser(),
  isAuthenticated: !!db.getCurrentUser(),
  isLoadingAuth: true,
  authError: null,
  authChecked: false,
});

function authReducer(state, action) {
  switch (action.type) {
    case 'INIT_DONE':
      return { ...state, isLoadingAuth: false, authChecked: true };
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false };
    case 'SET_USER':
      return { ...state, user: action.user, isAuthenticated: !!action.user };
    case 'SET_ERROR':
      return { ...state, authError: action.error };
    default:
      return state;
  }
}

export const AuthProvider = ({ children }) => {
  const [authState, dispatch] = useReducer(authReducer, null, initialState);

  useEffect(() => {
    dispatch({ type: 'INIT_DONE' });
  }, []);

  const logout = useCallback((shouldRedirect = true) => {
    db.setCurrentUserEmail(null);
    dispatch({ type: 'LOGOUT' });
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
    dispatch({ type: 'SET_USER', user: current });
    return current;
  }, []);

  const { user, isAuthenticated, isLoadingAuth, authError, authChecked } = authState;

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
