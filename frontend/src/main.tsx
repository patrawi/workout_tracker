import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/query-client.ts'
import { AuthProvider } from './context/AuthContext.tsx'
import './index.css'
import Layout from './components/Layout.tsx'
import App from './App.tsx'

const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage.tsx'))
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx'))
const HistoryPage = lazy(() => import('./pages/HistoryPage.tsx'))
const DailyWorkoutPage = lazy(() => import('./pages/DailyWorkoutPage.tsx'))
const NutritionPage = lazy(() => import('./pages/NutritionPage.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<Layout />}>
          <Route path="/" element={<App />} />
          <Route
            path="/analytics"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="skeleton h-8 w-40" />
                  </div>
                }
              >
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route
            path="/profile"
            element={
              <Suspense
                fallback={
                  <div className="min-h-screen flex items-center justify-center">
                    <div className="skeleton h-8 w-40" />
                  </div>
                }
              >
                <ProfilePage />
              </Suspense>
            }
          />
          <Route
            path="/history"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="skeleton h-8 w-40" /></div>}>
                <HistoryPage />
              </Suspense>
            }
          />
          <Route
            path="/history/:date"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="skeleton h-8 w-40" /></div>}>
                <DailyWorkoutPage />
              </Suspense>
            }
          />
          <Route
            path="/nutrition"
            element={
              <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="skeleton h-8 w-40" /></div>}>
                <NutritionPage />
              </Suspense>
            }
          />
        </Route>
      </Routes>
      </AuthProvider>
    </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
