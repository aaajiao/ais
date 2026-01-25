import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import PageLoader from './components/ui/PageLoader';

// 首屏页面同步加载
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

// 懒加载其他页面
const Artworks = lazy(() => import('./pages/Artworks'));
const ArtworkDetail = lazy(() => import('./pages/ArtworkDetail'));
const Editions = lazy(() => import('./pages/Editions'));
const EditionDetail = lazy(() => import('./pages/EditionDetail'));
const Chat = lazy(() => import('./pages/Chat'));
const Import = lazy(() => import('./pages/Import'));
const Locations = lazy(() => import('./pages/Locations'));
const Trash = lazy(() => import('./pages/Trash'));
const Settings = lazy(() => import('./pages/Settings'));
const Links = lazy(() => import('./pages/Links'));
const PublicView = lazy(() => import('./pages/PublicView'));

function App() {
  return (
    <ThemeProvider>
      <Toaster position="top-center" richColors />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* 公开路由 */}
            <Route path="/login" element={<Login />} />
            <Route
              path="/view/:token"
              element={
                <Suspense fallback={<PageLoader />}>
                  <PublicView />
                </Suspense>
              }
            />

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
              <Route
                path="artworks"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Artworks />
                  </Suspense>
                }
              />
              <Route
                path="artworks/:id"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <ArtworkDetail />
                  </Suspense>
                }
              />
              <Route
                path="editions"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Editions />
                  </Suspense>
                }
              />
              <Route
                path="editions/:id"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <EditionDetail />
                  </Suspense>
                }
              />
              <Route
                path="chat"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Chat />
                  </Suspense>
                }
              />
              <Route
                path="import"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Import />
                  </Suspense>
                }
              />
              <Route
                path="locations"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Locations />
                  </Suspense>
                }
              />
              <Route
                path="trash"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Trash />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Settings />
                  </Suspense>
                }
              />
              <Route
                path="links"
                element={
                  <Suspense fallback={<PageLoader />}>
                    <Links />
                  </Suspense>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
