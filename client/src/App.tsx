import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { TaskRegistry } from './pages/TaskRegistry';
import { TaskDetail } from './pages/TaskDetail';
import { Analytics } from './pages/Analytics';
import { Notifications } from './pages/Notifications';
import { Settings } from './pages/Settings';

function PageLayout({ children }: { children: React.ReactNode }) {
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/dashboard"
        element={
          <PageLayout>
            <Dashboard />
          </PageLayout>
        }
      />
      <Route
        path="/tasks"
        element={
          <PageLayout>
            <TaskRegistry />
          </PageLayout>
        }
      />
      <Route
        path="/tasks/:id"
        element={
          <PageLayout>
            <TaskDetail />
          </PageLayout>
        }
      />
      <Route
        path="/analytics"
        element={
          <PageLayout>
            <Analytics />
          </PageLayout>
        }
      />
      <Route
        path="/notifications"
        element={
          <PageLayout>
            <Notifications />
          </PageLayout>
        }
      />
      <Route
        path="/settings"
        element={
          <PageLayout>
            <Settings />
          </PageLayout>
        }
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
