import { lazy, Suspense } from 'react';
import { Toaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { ThemeProvider } from '@/hooks/useTheme';

import AppLayout from './components/layout/AppLayout';
import Home from './pages/Home';

// Code-splitting: solo Home (+ layout) se cargan al inicio. El resto —y sobre
// todo el admin (recharts) y las páginas con jspdf/html2canvas— se cargan bajo
// demanda, recortando ~400 KiB del bundle inicial.
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const CompleteProfile = lazy(() => import('./pages/CompleteProfile'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Matches = lazy(() => import('./pages/Matches'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Prizes = lazy(() => import('./pages/Prizes'));
const Profile = lazy(() => import('./pages/Profile'));
const Info = lazy(() => import('./pages/Info'));
const Support = lazy(() => import('./pages/Support'));
const AdminLayout = lazy(() => import('./pages/admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'));
const AdminMatches = lazy(() => import('./pages/admin/AdminMatches'));
const AdminPredictions = lazy(() => import('./pages/admin/AdminPredictions'));
const AdminPrizes = lazy(() => import('./pages/admin/AdminPrizes'));
const AdminRedemptions = lazy(() => import('./pages/admin/AdminRedemptions'));
const AdminSupport = lazy(() => import('./pages/admin/AdminSupport'));
const AdminAuditLog = lazy(() => import('./pages/admin/AdminAuditLog'));

const PageSpinner = () => (
  <div className="flex items-center justify-center py-24">
    <div className="w-8 h-8 border-4 border-muted border-t-foreground rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // For auth_required or unknown errors, still show the app (public access)
  }

  // Render the main app - public access allowed
  return (
    <Suspense fallback={<PageSpinner />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/complete-profile" element={<CompleteProfile />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/prizes" element={<Prizes />} />
        <Route path="/info" element={<Info />} />
        <Route path="/support" element={<Support />} />
        <Route path="/profile" element={<Profile />} />
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/matches" element={<AdminMatches />} />
          <Route path="/admin/predictions" element={<AdminPredictions />} />
          <Route path="/admin/prizes" element={<AdminPrizes />} />
          <Route path="/admin/redemptions" element={<AdminRedemptions />} />
          <Route path="/admin/support" element={<AdminSupport />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthenticatedApp />
          </Router>
          <Toaster richColors position="bottom-center" />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App