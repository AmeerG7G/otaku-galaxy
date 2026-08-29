import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  BellOutlined,
  EnvironmentOutlined,
  FireOutlined,
  GiftOutlined,
  HomeOutlined,
  NodeIndexOutlined,
  PictureOutlined,
  SettingOutlined,
  ShoppingCartOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons'

export const NAV_ITEMS: MenuProps['items'] = [
  { key: '/', icon: <HomeOutlined />, label: 'الرئيسية' },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: 'الطلبات' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'المنتجات' },
  { key: '/categories', icon: <TagsOutlined />, label: 'الأقسام' },
  { key: '/banners', icon: <PictureOutlined />, label: 'البنرات' },
  { key: '/governorates', icon: <EnvironmentOutlined />, label: 'المحافظات والتوصيل' },
  { key: '/customers', icon: <TeamOutlined />, label: 'الزبائن' },
  { key: '/birthdays', icon: <GiftOutlined />, label: 'أعياد الميلاد' },
  { key: '/points', icon: <StarOutlined />, label: 'نقاط المجرّة' },
  { key: '/notifications', icon: <BellOutlined />, label: 'الإشعارات' },
  { key: '/offers', icon: <FireOutlined />, label: 'العروض' },
  { key: '/reviews', icon: <StarOutlined />, label: 'التقييمات' },
  { key: '/franchises', icon: <VideoCameraOutlined />, label: 'الأنمي' },
  { key: '/zones', icon: <NodeIndexOutlined />, label: 'مناطق التوصيل' },
  { key: '/settings', icon: <SettingOutlined />, label: 'الإعدادات' },
]

export function activeMenuKey(pathname: string): string {
  if (pathname === '/') return '/'
  return `/${pathname.split('/')[1] ?? ''}`
}