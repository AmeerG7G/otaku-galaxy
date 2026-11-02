-- يعكس 071_analytics_permission.sql.
-- [DATA] يفشل إن كان مسؤولٌ يحمل `analytics` — اسحبها أولاً من «المسؤولون»
-- (أو: UPDATE users SET admin_permissions = array_remove(admin_permissions, 'analytics');).
ALTER TABLE users DROP CONSTRAINT users_admin_permissions_known;
ALTER TABLE users
  ADD CONSTRAINT users_admin_permissions_known
    CHECK (admin_permissions <@ ARRAY[
      'dashboard', 'orders', 'delivery', 'products', 'categories', 'franchises',
      'offers', 'restock', 'customers', 'account_requests', 'points', 'birthdays',
      'reviews', 'notifications', 'banners', 'settings', 'admins'
    ]::TEXT[]);
DELETE FROM schema_migrations WHERE name = '071_analytics_permission.sql';
