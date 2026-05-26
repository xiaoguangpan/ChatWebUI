import type { ReactNode } from 'react';
import { Navigate, createBrowserRouter, RouterProvider, useLocation } from 'react-router-dom';
import { getAuthToken } from './api';
import { AdminShell } from './components/AdminShell';
import { ClientShell } from './components/ClientShell';
import { ChatPage } from './routes/ChatPage';
import { HelpCenterPage } from './routes/HelpCenterPage';
import { ImagePage } from './routes/ImagePage';
import { PointsPage } from './routes/PointsPage';
import { ProfileInfoPage } from './routes/ProfileInfoPage';
import { ProfilePage } from './routes/ProfilePage';
import { ProfileSecurityPage } from './routes/ProfileSecurityPage';
import { TermsPage } from './routes/TermsPage';
import { AdminLoginPage } from './routes/admin/AdminLoginPage';
import { DashboardPage } from './routes/admin/DashboardPage';
import { GenerationsPage } from './routes/admin/GenerationsPage';
import { ModelServicePage } from './routes/admin/ModelServicePage';
import { PointsLogPage } from './routes/admin/PointsLogPage';
import { SystemLogsPage } from './routes/admin/SystemLogsPage';
import { UserDetailPage } from './routes/admin/UserDetailPage';
import { UsersPage } from './routes/admin/UsersPage';

const router = createBrowserRouter([
  {
    path: '/',
    element: <ClientShell />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: 'c/:id', element: <RequireToken redirectTo="/?auth=login" scope="client"><ChatPage /></RequireToken> },
      { path: 'image', element: <RequireToken redirectTo="/?auth=login" scope="client"><ImagePage /></RequireToken> },
      { path: 'image/:id', element: <RequireToken redirectTo="/?auth=login" scope="client"><ImagePage /></RequireToken> },
      { path: 'profile', element: <RequireToken redirectTo="/?auth=login" scope="client"><ProfilePage /></RequireToken> },
      { path: 'profile/info', element: <RequireToken redirectTo="/?auth=login" scope="client"><ProfileInfoPage /></RequireToken> },
      { path: 'profile/security', element: <RequireToken redirectTo="/?auth=login" scope="client"><ProfileSecurityPage /></RequireToken> },
      { path: 'points', element: <RequireToken redirectTo="/?auth=login" scope="client"><PointsPage /></RequireToken> },
      { path: 'help', element: <HelpCenterPage /> },
      { path: 'terms', element: <TermsPage /> },
    ],
  },
  { path: '/login', element: <Navigate to="/?auth=login" replace /> },
  { path: '/register', element: <Navigate to="/?auth=register" replace /> },
  { path: '/admin/login', element: <AdminLoginPage /> },
  {
    path: '/admin',
    element: (
      <RequireToken redirectTo="/admin/login" scope="admin">
        <AdminShell />
      </RequireToken>
    ),
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'model-service', element: <ModelServicePage /> },
      { path: 'ai-models', element: <Navigate to="/admin/model-service" replace /> },
      { path: 'image-models', element: <Navigate to="/admin/model-service" replace /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'users/:id', element: <UserDetailPage /> },
      { path: 'generations', element: <GenerationsPage /> },
      { path: 'points-log', element: <PointsLogPage /> },
      { path: 'system-logs', element: <SystemLogsPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]);

function RequireToken({ children, redirectTo, scope = 'client' }: { children: ReactNode; redirectTo: string; scope?: 'client' | 'admin' }) {
  const location = useLocation();
  if (!getAuthToken(scope)) {
    return <Navigate to={redirectTo} replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}

export function App() {
  return <RouterProvider router={router} />;
}
