import { createContext, useContext, useEffect, useCallback, useMemo, useReducer } from 'react';
import { db } from '@/lib/db';
import { supabase, isSupabaseAvailable } from '@/lib/supabase';

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
    let authSubscription = null;
    let dbSyncListener = null;

    const refreshCurrentUser = () => {
      const current = db.getCurrentUser();
      dispatch({ type: 'SET_USER', user: current });
    };

    const initAuth = async () => {
      try {
        if (isSupabaseAvailable()) {
          const { data: { session }, error } = await supabase.auth.getSession();
          // Si el refresh token esta stale o invalido (ej: se cambio la clave
          // del proyecto, o se limpio el storage del navegador), Supabase
          // devuelve un 400 Invalid Refresh Token. Limpiamos el storage
          // local silenciosamente para que la app arranque como visitante
          // en vez de quedarse spameando el error en cada refresh.
          if (error && /Invalid Refresh Token/i.test(error.message || '')) {
            console.warn('Auth: refresh token inválido — limpiando sesión local.');
            try {
              // supabase-js guarda el session en localStorage con keys tipo
              // "sb-<project-ref>-auth-token". Limpiamos TODAS las keys de
              // sesión que empiecen con sb- + -auth-token.
              for (let i = localStorage.length - 1; i >= 0; i--) {
                const k = localStorage.key(i);
                if (k && /^sb-.*-auth-token$/.test(k)) localStorage.removeItem(k);
              }
            } catch {}
            db.setCurrentUserEmail(null);
          } else if (session?.user) {
            db.setCurrentUserEmail(session.user.email);
            // Esperar la primera carga desde Supabase ANTES de resolver el
            // usuario. Sin esto, getCurrentUser() buscaba en la memoria local
            // (aún vacía), devolvía null, y la app arrancaba "deslogueada":
            // el guard de admin mostraba "No tienes permiso", el navbar
            // "Crear cuenta", etc., hasta que llegaba el sync y todo
            // cambiaba de golpe. El spinner global (isLoadingAuth) cubre
            // esta espera. Los visitantes sin sesión no esperan nada.
            await db.whenReady();
            refreshCurrentUser();
          }
        }
      } catch (err) {
        console.warn("Auth init error:", err?.message || err);
      } finally {
        dispatch({ type: 'INIT_DONE' });
      }
    };

    initAuth();

    // Escuchar syncs posteriores (Realtime, etc.) para refrescar el usuario
    dbSyncListener = () => {
      refreshCurrentUser();
    };
    window.addEventListener('db-synced', dbSyncListener);

    if (isSupabaseAvailable()) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          db.setCurrentUserEmail(session.user.email);
          // Esperar la carga inicial igual que initAuth — este evento puede
          // dispararse al arrancar, antes de que la tabla users esté en
          // memoria, y publicaría user=null pisando al usuario real.
          db.whenReady().then(() => {
            dispatch({ type: 'SET_USER', user: db.getCurrentUser() });
          });
        } else {
          db.setCurrentUserEmail(null);
          dispatch({ type: 'LOGOUT' });
        }
      });
      authSubscription = subscription;
    }

    return () => {
      if (authSubscription) authSubscription.unsubscribe();
      if (dbSyncListener) window.removeEventListener('db-synced', dbSyncListener);
    };
  }, []);

  const logout = useCallback(async (shouldRedirect = true) => {
    if (isSupabaseAvailable()) {
      await supabase.auth.signOut();
    }
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
