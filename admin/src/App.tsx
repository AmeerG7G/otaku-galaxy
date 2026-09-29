import { Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RequirePermission from './components/RequirePermission'
import AppLayout from './layouts/AppLayout'
import PageLoader from './components/PageLoader'
import { useAdminProfile } from './hooks/useAdminProfile'
import { firstAllowedPath } from './layouts/nav'
import { canAccess, type AdminSection } from './types/adminPermissions'

const LoginPage = lazy(() => import('./features/auth/LoginPage'))
const DashboardHome = lazy(() => import('./pages/DashboardHome'))
const OrdersPage = lazy(() => import('./pages/OrdersPage'))
const OrderDetailPage = lazy(() => import('./pages/OrderDetailPage'))
const ProductsPage = lazy(() => import('./pages/ProductsPage'))
const ProductNewPage = lazy(() => import('./pages/ProductNewPage'))
const ProductEditPage = lazy(() => import('./pages/ProductEditPage'))
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'))
const BannersPage = lazy(() => import('./pages/BannersPage'))
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'))
const CustomersPage = lazy(() => import('./pages/CustomersPage'))
const CustomerDetailPage = lazy(() => import('./pages/CustomerDetailPage'))
const AccountRequestsPage = lazy(() => import('./pages/AccountRequestsPage'))
const BirthdaysPage = lazy(() => import('./pages/BirthdaysPage'))
const PointsPage = lazy(() => import('./pages/PointsPage'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const OffersPage = lazy(() => import('./pages/OffersPage'))
const RestockPage = lazy(() => import('./pages/RestockPage'))
const ReviewsPage = lazy(() => import('./pages/ReviewsPage'))
const FranchisesPage = lazy(() => import('./pages/FranchisesPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const AdminsPage = lazy(() => import('./pages/AdminsPage'))

/** كل صفحة خلف قسمها — انظر `RequirePermission`. */
function guard(section: AdminSection, element: ReactNode) {
  return <RequirePermission section={section}>{element}</RequirePermission>
}

/**
 * الرئيسية لمن يملكها؛ ومن لا يملكها يُحوَّل إلى أول قسمٍ يملكه بدل صفحة
 * «لا صلاحية» عند كل دخول.
 */
function HomeRoute() {
  const { data: profile, isPending } = useAdminProfile()
  if (isPending) return <PageLoader />
  if (canAccess(profile, 'dashboard')) return <DashboardHome />
  const target = firstAllowedPath(profile)
  return target ? <Navigate to={target} replace /> : guard('dashboard', null)
}

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<HomeRoute />} />
              <Route path="/orders" element={guard('orders', <OrdersPage />)} />
              <Route path="/orders/:id" element={guard('orders', <OrderDetailPage />)} />
              <Route path="/products" element={guard('products', <ProductsPage />)} />
              <Route path="/products/new" element={guard('products', <ProductNewPage />)} />
              <Route path="/products/:id/edit" element={guard('products', <ProductEditPage />)} />
              <Route path="/categories" element={guard('categories', <CategoriesPage />)} />
              <Route path="/banners" element={guard('banners', <BannersPage />)} />
              <Route path="/delivery" element={guard('delivery', <DeliveryPage />)} />
              {/* المساران القديمان يوصلان إلى الشاشة الموحّدة — روابط محفوظة
                  في متصفح المسؤول يجب ألا تنتهي إلى صفحة مفقودة. */}
              <Route path="/governorates" element={<Navigate to="/delivery" replace />} />
              <Route path="/zones" element={<Navigate to="/delivery" replace />} />
              <Route path="/customers" element={guard('customers', <CustomersPage />)} />
              <Route path="/customers/:id" element={guard('customers', <CustomerDetailPage />)} />
              <Route path="/account-requests" element={guard('account_requests', <AccountRequestsPage />)} />
              <Route path="/birthdays" element={guard('birthdays', <BirthdaysPage />)} />
              <Route path="/points" element={guard('points', <PointsPage />)} />
              <Route path="/notifications" element={guard('notifications', <NotificationsPage />)} />
              <Route path="/offers" element={guard('offers', <OffersPage />)} />
              <Route path="/restock" element={guard('restock', <RestockPage />)} />
              <Route path="/reviews" element={guard('reviews', <ReviewsPage />)} />
              <Route path="/franchises" element={guard('franchises', <FranchisesPage />)} />
              <Route path="/settings" element={guard('settings', <SettingsPage />)} />
              <Route path="/admins" element={guard('admins', <AdminsPage />)} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App