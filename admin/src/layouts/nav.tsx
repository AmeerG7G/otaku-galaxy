import type { MenuProps } from 'antd'
import {
  NotificationOutlined,
  AppstoreOutlined,
  BellOutlined,
  CommentOutlined,
  EnvironmentOutlined,
  FireOutlined,
  GiftOutlined,
  HomeOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  UserSwitchOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'
import { canAccess, type AdminProfile, type AdminSection } from '../types/adminPermissions'

/**
 * القائمة مجمَّعة بحسب ما يفعله المسؤول لا بحسب جداول القاعدة.
 *
 * المجموعات (لا القوائم المنسدلة) تُبقي كل شيء بضغطة واحدة وتضيف عناوين
 * تُقصّر البحث. كل بند له أيقونة مميزة حتى لا تتشابه الأقسام بصرياً.
 */
export const NAV_ITEMS: MenuProps['items'] = [
  { key: '/', icon: <HomeOutlined />, label: 'الرئيسية' },
  {
    key: 'group-operations',
    type: 'group',
    label: 'العمليات',
    children: [
      { key: '/orders', icon: <ShoppingCartOutlined />, label: 'الطلبات' },
      { key: '/delivery', icon: <EnvironmentOutlined />, label: 'المحافظات والتوصيل' },
    ],
  },
  {
    key: 'group-catalog',
    type: 'group',
    label: 'الكتالوج',
    children: [
      { key: '/products', icon: <AppstoreOutlined />, label: 'المنتجات' },
      { key: '/categories', icon: <TagsOutlined />, label: 'الأقسام' },
      { key: '/franchises', icon: <VideoCameraOutlined />, label: 'الأنمي' },
      { key: '/offers', icon: <FireOutlined />, label: 'العروض' },
      { key: '/restock', icon: <NotificationOutlined />, label: 'طلبات التوفر' },
    ],
  },
  {
    key: 'group-customers',
    type: 'group',
    label: 'الزبائن',
    children: [
      { key: '/customers', icon: <TeamOutlined />, label: 'الزبائن' },
      { key: '/account-requests', icon: <SafetyCertificateOutlined />, label: 'طلبات الحساب' },
      { key: '/points', icon: <StarOutlined />, label: 'نقاط المجرّة' },
      { key: '/birthdays', icon: <GiftOutlined />, label: 'أعياد الميلاد' },
      { key: '/reviews', icon: <CommentOutlined />, label: 'التقييمات' },
    ],
  },
  {
    key: 'group-marketing',
    type: 'group',
    label: 'المحتوى والتسويق',
    children: [
      { key: '/notifications', icon: <BellOutlined />, label: 'الإشعارات' },
      { key: '/banners', icon: <PictureOutlined />, label: 'البنرات' },
    ],
  },
  {
    key: 'group-settings',
    type: 'group',
    label: 'الإعدادات',
    children: [
      { key: '/settings', icon: <SettingOutlined />, label: 'إعدادات المتجر' },
      { key: '/admins', icon: <UserSwitchOutlined />, label: 'المسؤولون' },
    ],
  },
]

/**
 * القسم الذي يحكم كل صفحة — القائمة وحاجز الصفحة يقرآن منه.
 *
 * [SECURITY] هذا لبناء الواجهة فقط؛ الخادم يفرض الصلاحية نفسها على كل مسار
 * (`backend/src/routes/admin.ts`). صفحةٌ تظهر هنا خطأً تُرفض طلباتها هناك.
 */
export const SECTION_FOR_PATH: Record<string, AdminSection> = {
  '/': 'dashboard',
  '/orders': 'orders',
  '/delivery': 'delivery',
  '/products': 'products',
  '/categories': 'categories',
  '/franchises': 'franchises',
  '/offers': 'offers',
  '/restock': 'restock',
  '/customers': 'customers',
  '/account-requests': 'account_requests',
  '/points': 'points',
  '/birthdays': 'birthdays',
  '/reviews': 'reviews',
  '/notifications': 'notifications',
  '/banners': 'banners',
  '/settings': 'settings',
  '/admins': 'admins',
}

type NavItem = NonNullable<MenuProps['items']>[number]

/** القائمة كما يراها هذا المسؤول: بنود أقسامه فقط، والمجموعة الفارغة تختفي. */
export function navItemsFor(profile: Pick<AdminProfile, 'isSuperAdmin' | 'permissions'> | null | undefined): NavItem[] {
  const allowed = (key: unknown) => {
    const section = SECTION_FOR_PATH[String(key)]
    return section !== undefined && canAccess(profile, section)
  }
  const result: NavItem[] = []
  for (const item of NAV_ITEMS ?? []) {
    if (!item) continue
    if ('type' in item && item.type === 'group') {
      const children = (item.children ?? []).filter((child) => child && allowed(child.key))
      if (children.length > 0) result.push({ ...item, children })
    } else if (allowed(item.key)) {
      result.push(item)
    }
  }
  return result
}

/** أول صفحةٍ يملكها المسؤول — وجهة الرئيسية حين لا يملك «الرئيسية». */
export function firstAllowedPath(profile: Pick<AdminProfile, 'isSuperAdmin' | 'permissions'> | null | undefined): string | null {
  for (const [path, section] of Object.entries(SECTION_FOR_PATH)) {
    if (canAccess(profile, section)) return path
  }
  return null
}

export function activeMenuKey(pathname: string): string {
  if (pathname === '/') return '/'
  return `/${pathname.split('/')[1] ?? ''}`
}

/** عنوان القسم الحالي لرأس الصفحة — يُشتق من بنود القائمة نفسه. */
export function navTitleFor(key: string): string {
  const index: Record<string, string> = {
    '/': 'الرئيسية',
    '/orders': 'الطلبات',
    '/delivery': 'المحافظات والتوصيل',
    '/products': 'المنتجات',
    '/categories': 'الأقسام',
    '/franchises': 'الأنمي',
    '/offers': 'العروض',
    '/customers': 'الزبائن',
    '/account-requests': 'طلبات الحساب',
    '/restock': 'طلبات التوفر',
    '/admins': 'المسؤولون',
    '/points': 'نقاط المجرّة',
    '/birthdays': 'أعياد الميلاد',
    '/reviews': 'التقييمات',
    '/notifications': 'الإشعارات',
    '/banners': 'البنرات',
    '/settings': 'إعدادات المتجر',
  }
  return index[key] ?? 'لوحة التحكم'
}