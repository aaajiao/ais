import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Artworks from './pages/Artworks';
import ArtworkDetail from './pages/ArtworkDetail';
import Editions from './pages/Editions';
import EditionDetail from './pages/EditionDetail';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import Import from './pages/Import';
import Locations from './pages/Locations';

function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
          {/* 公开路由 */}
          <Route path="/login" element={<Login />} />

          {/* 受保护路由 */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="artworks" element={<Artworks />} />
            <Route path="artworks/:id" element={<ArtworkDetail />} />
            <Route path="editions" element={<Editions />} />
            <Route path="editions/:id" element={<EditionDetail />} />
            <Route path="chat" element={<Chat />} />
            <Route path="import" element={<Import />} />
            <Route path="locations" element={<Locations />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
