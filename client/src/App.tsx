import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AdminRoute from './components/AdminRoute';
import AdminLayout from './components/AdminLayout';
import HomePage from './pages/HomePage';
import DatasetsPage from './pages/DatasetsPage';
import DatasetDetailPage from './pages/DatasetDetailPage';
import Dashboard from './pages/Dashboard';
import Datasets from './pages/Datasets';
import DataViewer from './pages/DataViewer';
import Users from './pages/Users';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import AuthCallback from './pages/auth/AuthCallback';

function DataViewerLayout() {
  return (
    <div className="min-h-screen bg-dark-900 text-gray-100 font-sans">
      <main className="h-screen p-4 md:p-8">
        <DataViewer />
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* Public dataset viewer */}
          <Route path="/datasets" element={<DatasetsPage />} />
          <Route path="/datasets/:id" element={<DatasetDetailPage />} />
          <Route path="/datasets/:id/records" element={<DataViewerLayout />} />
          
          {/* Admin-only routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="datasets" element={<Datasets />} />
            <Route path="users" element={<Users />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
