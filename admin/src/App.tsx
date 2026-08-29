import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './layouts/AppLayout'
import PageLoader from './components/PageLoader'

const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const DashboardHome = lazy(() => import('./pages/DashboardHome'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductNewPage = lazy(() => import('./pages/ProductNewPage'))
const ProductEditPage = lazy(() => import('./pages/ProductEditPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const BannersPage = lazy(() => import('./pages/BannersPage'))
const GovernoratesPage = lazy(() => import('./pages/GovernoratesPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const BirthdaysPage = lazy(() => import('./pages/BirthdaysPage'))
const PointsPage = lazy(() => import('./pages/PointsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const OffersPage = lazy(() => import('./pages/OffersPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
const FranchisesPage = lazy(() => import('./pages/FranchisesPage'))
const DeliveryZonesPage = lazy(() => import('./pages/DeliveryZonesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardHome />} />
              <Route path="/orders" element={<OrdersPage />} />
              <Route path="/orders/:id" element={<OrderDetailPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/products/new" element={<ProductNewPage />} />
              <Route path="/products/:id/edit" element={<ProductEditPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/banners" element={<BannersPage />} />
              <Route path="/governorates" element={<GovernoratesPage />} />
              <Route path="/customers" element={<CustomersPage />} />
              <Route path="/birthdays" element={<BirthdaysPage />} />
              <Route path="/points" element={<PointsPage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/offers" element={<OffersPage />} />
              <Route path="/reviews" element={<ReviewsPage />} />
              <Route path="/franchises" element={<FranchisesPage />} />
              <Route path="/zones" element={<DeliveryZonesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App