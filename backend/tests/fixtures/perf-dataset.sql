-- بيانات بحجم متجرٍ بعد سنة — لتدقيق الأداء (#5) على قاعدة الاختبار وحدها.
-- كل شيء موسوم كي يُمحى بـ`perf-dataset-purge.sql`:
--   users: username perf-user-N + phone +96479xxxxxxxx + password_hash 'x'
--          (الثلاثة معاً هي الهوية — انظر الهجرة ٠٦١). الربط أدناه بالاسم
--          والتجزئة لا بالهاتف: `ON CONFLICT (phone) DO NOTHING` كان سيعلّق
--          طلبات الأداء وتقييماته بزبونٍ حقيقي يملك الرقم نفسه.
--   products: name perf-product-N في قسم perf-cat
--   orders: number perf-N
BEGIN;

INSERT INTO categories (name, image_url) VALUES ('perf-cat', '') ON CONFLICT (name) DO NOTHING;
INSERT INTO subcategories (category_id, name, sort_order)
SELECT c.id, 'perf-sub-' || g, g FROM categories c, generate_series(1, 5) g WHERE c.name = 'perf-cat'
ON CONFLICT (category_id, name) DO NOTHING;

INSERT INTO users (username, phone, password_hash, role, phone_verified_at, birth_day, birth_month, gender, is_active, created_at)
SELECT 'perf-user-' || g, '+96479' || lpad(g::text, 8, '0'), 'x', 'customer', now(),
       CASE WHEN g % 3 = 0 THEN NULL ELSE 1 + (g % 28) END,
       CASE WHEN g % 3 = 0 THEN NULL ELSE 1 + (g % 12) END,
       CASE WHEN g % 2 = 0 THEN 'male' ELSE 'female' END,
       (g % 50 <> 0),
       now() - (g || ' minutes')::interval
FROM generate_series(1, 3000) g
ON CONFLICT (phone) DO NOTHING;

INSERT INTO products (name, description, price, category_id, subcategory_id, stock, is_active, is_offer, offer_rank, is_selected, selected_rank, created_at, previous_price)
SELECT 'perf-product-' || g, 'desc ' || g, 5000 + (g % 200) * 250, c.id,
       (SELECT id FROM subcategories s WHERE s.category_id = c.id AND s.name = 'perf-sub-' || (1 + g % 5)),
       g % 30, (g % 40 <> 0), (g % 25 = 0), CASE WHEN g % 25 = 0 THEN g END,
       (g % 33 = 0), CASE WHEN g % 33 = 0 THEN g END,
       now() - (g || ' seconds')::interval,
       CASE WHEN g % 7 = 0 THEN 5000 + (g % 200) * 250 + 1000 END
FROM categories c, generate_series(1, 10000) g WHERE c.name = 'perf-cat';

INSERT INTO product_images (product_id, url, sort_order)
SELECT p.id, '/uploads/product/perf/' || p.id || '-' || i || '.jpg', i
FROM products p, generate_series(0, 2) i WHERE p.name LIKE 'perf-product-%';

INSERT INTO governorates (name, delivery_fee) VALUES ('perf-gov', 5000) ON CONFLICT (name) DO NOTHING;

-- 10 000 orders over 3 000 users, status spread, spread over the last 400 days.
INSERT INTO orders (number, user_id, governorate_id, province, full_address, phone, products_total, delivery_fee, discount, total, status, created_at, dispatched_at, delivered_at, rating_reminder_at, rating_reminder_sent_at)
SELECT 'perf-' || g, u.id, gov.id, 'perf-gov', 'addr ' || g, u.phone,
       20000, 5000, 0, 25000,
       (ARRAY['PENDING_ADMIN_CONFIRMATION','OUT_FOR_DELIVERY','COMPLETED','COMPLETED','COMPLETED','REJECTED'])[1 + g % 6],
       now() - ((g * 3456) % (400 * 86400) || ' seconds')::interval,
       CASE WHEN g % 6 IN (1, 2, 3, 4) THEN now() - ((g * 3456) % (400 * 86400) || ' seconds')::interval END,
       CASE WHEN g % 6 IN (2, 3, 4) THEN now() - ((g * 3456) % (400 * 86400) || ' seconds')::interval END,
       CASE WHEN g % 6 IN (1, 2, 3, 4) THEN now() - ((g * 3456) % (400 * 86400) || ' seconds')::interval + interval '1 day' END,
       CASE WHEN g % 6 IN (2, 3) THEN now() END
FROM generate_series(1, 10000) g
JOIN users u ON u.username = 'perf-user-' || (1 + g % 3000) AND u.password_hash = 'x'
JOIN governorates gov ON gov.name = 'perf-gov';

-- 1–3 items per order.
INSERT INTO order_items (order_id, product_id, product_name, price, option_value, quantity, line_total, image_url)
SELECT o.id, p.id, p.name, p.price, NULL, 1, p.price, NULL
FROM orders o
JOIN LATERAL (
  SELECT id, name, price FROM products
  WHERE name = ANY(ARRAY['perf-product-' || (1 + (('x' || substr(md5(o.number), 1, 6))::bit(24)::int % 10000)),
                          'perf-product-' || (1 + (('x' || substr(md5(o.number), 7, 6))::bit(24)::int % 10000)),
                          'perf-product-' || (1 + (('x' || substr(md5(o.number), 13, 6))::bit(24)::int % 10000))])
  LIMIT 1 + (('x' || substr(md5(o.number), 19, 2))::bit(8)::int % 3)
) p ON TRUE
WHERE o.number LIKE 'perf-%';

INSERT INTO order_status_history (order_id, status, created_at)
SELECT o.id, 'PENDING_ADMIN_CONFIRMATION', o.created_at FROM orders o WHERE o.number LIKE 'perf-%';
INSERT INTO order_status_history (order_id, status, note, created_at)
SELECT o.id, o.status, CASE WHEN o.status = 'REJECTED' THEN 'perf rejection' END, o.created_at + interval '1 hour'
FROM orders o WHERE o.number LIKE 'perf-%' AND o.status <> 'PENDING_ADMIN_CONFIRMATION';

-- 10 000 notifications.
INSERT INTO notifications (user_id, type, title, body, read_at, created_at)
SELECT u.id, (ARRAY['orderAccepted','promotion','receiptReminder','backInStock','reviewApproved'])[1 + g % 5],
       'perf title ' || g, 'perf body ' || g,
       CASE WHEN g % 3 = 0 THEN now() END,
       now() - (g || ' minutes')::interval
FROM generate_series(1, 10000) g
JOIN users u ON u.username = 'perf-user-' || (1 + g % 3000) AND u.password_hash = 'x';

-- 10 000 reviews: one per (user, product) pair, on perf products, by perf users.
INSERT INTO reviews (user_id, order_id, product_id, product_name, rating, comment, status, rejection_reason, customer_name, photo_urls, created_at)
SELECT u.id, o.id, p.id, p.name, 1 + g % 5, 'perf comment ' || g,
       (ARRAY['approved','approved','approved','pending','rejected'])[1 + g % 5],
       CASE WHEN g % 5 = 4 THEN 'perf reason' END,
       u.username,
       CASE WHEN g % 4 = 0 THEN ARRAY['/uploads/review/perf/' || g || '.jpg'] ELSE '{}'::text[] END,
       now() - (g || ' minutes')::interval
FROM generate_series(1, 10000) g
JOIN users u ON u.username = 'perf-user-' || (1 + g % 3000) AND u.password_hash = 'x'
JOIN products p ON p.name = 'perf-product-' || (1 + (g * 7) % 10000)
JOIN LATERAL (SELECT id FROM orders o WHERE o.user_id = u.id AND o.number LIKE 'perf-%' LIMIT 1) o ON TRUE
ON CONFLICT DO NOTHING;

-- points ledger: one purchase row per completed order + review rows.
INSERT INTO points_ledger (user_id, label, amount, reason, order_id, created_at)
SELECT o.user_id, 'perf purchase', 10, 'order_received', o.id, o.created_at
FROM orders o WHERE o.number LIKE 'perf-%' AND o.status = 'COMPLETED'
ON CONFLICT DO NOTHING;
INSERT INTO points_ledger (user_id, label, amount, reason, order_id, review_id, created_at)
SELECT r.user_id, 'perf review', 5, 'review_approved', r.order_id, r.id, r.created_at
FROM reviews r WHERE r.status = 'approved' AND r.comment LIKE 'perf comment %'
ON CONFLICT DO NOTHING;

COMMIT;
