/**
 * Paths robots.txt asks crawlers to skip (src/app/robots.ts). Every page under
 * them already sets `robots: { index: false }`; robots.test.ts keeps the two in step.
 */
export const PRIVATE_PATHS = [
  '/bff/',
  '/account',
  '/alerts',
  '/cart',
  '/checkout',
  '/favorites',
  '/forgot-password',
  '/login',
  '/notifications',
  '/orders',
  '/points',
  '/register',
  '/search',
];

