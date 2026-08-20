import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  EnvironmentOutlined,
  FireOutlined,
  HomeOutlined,
  PictureOutlined,
  ShoppingCartOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons'

export const NAV_ITEMS: MenuProps['items'] = [
  { key: '/', icon: <HomeOutlined />, label: 'الرئيسية' },
  { key: '/orders', icon: <ShoppingCartOutlined />, label: 'الطلبات' },
  { key: '/products', icon: <AppstoreOutlined />, label: 'المنتجات' },
  { key: '/categories', icon: <TagsOutlined />, label: 'الأقسام' },
  { key: '/banners', icon: <PictureOutlined />, label: 'البنرات' },
  { key: '/governorates', icon: <EnvironmentOutlined />, label: 'المحافظات والتوصيل' },
  { key: '/customers', icon: <TeamOutlined />, label: 'الزبائن' },
  { key: '/offers', icon: <FireOutlined />, label: 'العروض' },
]

export function activeMenuKey(pathname: string): string {
  if (pathname === '/') return '/'
  return `/${pathname.split('/')[1] ?? ''}`
}