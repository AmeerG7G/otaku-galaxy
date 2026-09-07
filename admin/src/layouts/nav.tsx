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
  SettingOutlined,
  ShoppingCartOutlined,
  SmileOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'

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
      { key: '/visuals', icon: <SmileOutlined />, label: 'رسوم الشخصيات' },
    ],
  },
  {
    key: 'group-settings',
    type: 'group',
    label: 'الإعدادات',
    children: [{ key: '/settings', icon: <SettingOutlined />, label: 'إعدادات المتجر' }],
  },
]

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
    '/points': 'نقاط المجرّة',
    '/birthdays': 'أعياد الميلاد',
    '/reviews': 'التقييمات',
    '/notifications': 'الإشعارات',
    '/banners': 'البنرات',
    '/visuals': 'رسوم الشخصيات',
    '/settings': 'إعدادات المتجر',
  }
  return index[key] ?? 'لوحة التحكم'
}