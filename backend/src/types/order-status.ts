import type { OrderStatus } from '../types/index.js';

export const ORDER_STATUSES = [
  'PENDING_ADMIN_CONFIRMATION',
  'CONFIRMED',
  'PREPARING',
  'OUT_FOR_DELIVERY',
  'COMPLETED',
  'REJECTED',
] as const satisfies readonly OrderStatus[];