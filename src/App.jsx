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
import Login from './pages/Login';
import Register from './pages/Register';
import CompleteProfile from './pages/CompleteProfile';
import Matches from './pages/Matches';
import Ranking from './pages/Ranking';
import Prizes from './pages/Prizes';
import Profile from './pages/Profile';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminMatches from './pages/admin/AdminMatches';
import AdminPredictions from './pages/admin/AdminPredictions';
import AdminPrizes from './pages/admin/AdminPrizes';
import AdminRedemptions from './pages/admin/AdminRedemptions';
import AdminSupport from './pages/admin/AdminSupport';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import Info from './pages/Info';
import Support from './pages/Support';

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
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
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
  );
};


function App() {

  return (
    <ThemeProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster richColors position="bottom-center" />
        </QueryClientProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App