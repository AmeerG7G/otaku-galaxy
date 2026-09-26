-- Domain invariant sweep (Audit #6, STEP 56.5) — READ ONLY: runs inside BEGIN READ ONLY … ROLLBACK.
-- Usage: psql "$DATABASE_URL" -X -q -f backend/scripts/domain-invariants.sql   (every count should be 0
-- except rows marked INFO; see STEP 56.5 / STEP 57 for the known dev-DB residue behind I22/I23/I26 and
-- backend/scripts/restock-residue-diagnostic.sql for the per-row provenance of I22/I23).
BEGIN READ ONLY;
SELECT 'I01 stock >= 0' AS inv, count(*) FROM products WHERE stock < 0
UNION ALL SELECT 'I02 total = products + fee - delivery_discount - discount (clamped)', count(*) FROM orders
  WHERE total <> GREATEST(0, products_total + delivery_fee - delivery_discount - discount)
UNION ALL SELECT 'I03 products_total = sum(line_total)', count(*) FROM orders o
  WHERE products_total <> COALESCE((SELECT SUM(line_total) FROM order_items WHERE order_id = o.id), 0)
UNION ALL SELECT 'I04 line_total = price * quantity', count(*) FROM order_items WHERE line_total <> price * quantity
UNION ALL SELECT 'I05 order has >= 1 item', count(*) FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_items WHERE order_id = o.id)
UNION ALL SELECT 'I06 COMPLETED ⇒ delivered_at', count(*) FROM orders WHERE status = 'COMPLETED' AND delivered_at IS NULL
UNION ALL SELECT 'I07 delivered_at ⇒ COMPLETED', count(*) FROM orders WHERE delivered_at IS NOT NULL AND status <> 'COMPLETED'
UNION ALL SELECT 'I08 last history row = current status', count(*) FROM orders o
  WHERE o.status <> (SELECT h.status FROM order_status_history h WHERE h.order_id = o.id ORDER BY h.created_at DESC, h.id DESC LIMIT 1)
UNION ALL SELECT 'I09 first history row = PENDING', count(*) FROM orders o
  WHERE (SELECT h.status FROM order_status_history h WHERE h.order_id = o.id ORDER BY h.created_at, h.id LIMIT 1) <> 'PENDING_ADMIN_CONFIRMATION'
UNION ALL SELECT 'I10 order_received ⇒ order COMPLETED & same owner', count(*) FROM points_ledger l
  LEFT JOIN orders o ON o.id = l.order_id
  WHERE l.reason = 'order_received' AND (o.id IS NULL OR o.status <> 'COMPLETED' OR o.user_id <> l.user_id)
UNION ALL SELECT 'I11 COMPLETED order ⇒ at most one order_received', count(*) FROM (
  SELECT order_id FROM points_ledger WHERE reason = 'order_received' GROUP BY order_id HAVING count(*) > 1) x
UNION ALL SELECT 'I12 review points ⇒ review approved & same owner', count(*) FROM points_ledger l
  LEFT JOIN reviews r ON r.id = l.review_id
  WHERE l.reason IN ('review_approved','review_with_photo') AND (r.id IS NULL OR r.status <> 'approved' OR r.user_id <> l.user_id)
UNION ALL SELECT 'I13 review points per order <= 20', count(*) FROM (
  SELECT order_id FROM points_ledger WHERE reason IN ('review_approved','review_with_photo') GROUP BY order_id HAVING SUM(amount) > 20) x
UNION ALL SELECT 'I14 ledger amounts positive (no negative rows written)', count(*) FROM points_ledger WHERE amount <= 0
UNION ALL SELECT 'I15 review ⇒ own COMPLETED order containing the product', count(*) FROM reviews r
  LEFT JOIN orders o ON o.id = r.order_id
  WHERE o.id IS NULL OR o.user_id <> r.user_id OR o.status <> 'COMPLETED'
     OR (r.product_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_id = r.product_id))
UNION ALL SELECT 'I16 approved/pending review ⇒ order delivered', count(*) FROM reviews r JOIN orders o ON o.id = r.order_id
  WHERE r.status <> 'rejected' AND o.delivered_at IS NULL
UNION ALL SELECT 'I17 redemption consumed by own order', count(*) FROM loyalty_reward_redemptions r JOIN orders o ON o.id = r.consumed_order_id
  WHERE o.user_id <> r.user_id
UNION ALL SELECT 'I18 order.loyalty_discount > 0 ⇔ a redemption consumed by it', count(*) FROM orders o
  WHERE (o.loyalty_discount > 0) <> EXISTS (SELECT 1 FROM loyalty_reward_redemptions r WHERE r.consumed_order_id = o.id)
UNION ALL SELECT 'I19 birthday usage by own order', count(*) FROM birthday_discount_usage b JOIN orders o ON o.id = b.order_id
  WHERE o.user_id <> b.user_id
UNION ALL SELECT 'I20 discount >= birthday + loyalty parts', count(*) FROM orders o
  WHERE o.discount < o.loyalty_discount + COALESCE((SELECT SUM(amount) FROM birthday_discount_usage b WHERE b.order_id = o.id), 0)
UNION ALL SELECT 'I21 product subcategory belongs to its category', count(*) FROM products p JOIN subcategories s ON s.id = p.subcategory_id
  WHERE s.category_id <> p.category_id
UNION ALL SELECT 'I22 INFO in-stock product carries a restock date (legal when the admin pre-set it — «المخزون يتقدّم على الموعد»; residue only with I23)', count(*) FROM products WHERE stock > 0 AND restock_at IS NOT NULL
UNION ALL SELECT 'I23 in-stock product has no waiting subscribers', count(*) FROM restock_subscriptions rs JOIN products p ON p.id = rs.product_id
  WHERE p.stock > 0
UNION ALL SELECT 'I24 account request pending ⇔ unresolved', count(*) FROM account_requests WHERE (status = 'pending') <> (resolved_at IS NULL)
UNION ALL SELECT 'I25 verified user has no pending registration request', count(*) FROM account_requests a JOIN users u ON u.id = a.user_id
  WHERE a.kind = 'registration' AND a.status = 'pending' AND u.phone_verified_at IS NOT NULL
UNION ALL SELECT 'I26 unverified customer has a registration request', count(*) FROM users u
  WHERE u.role = 'customer' AND u.phone_verified_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM account_requests a WHERE a.kind = 'registration' AND a.submitted_phone = u.phone)
UNION ALL SELECT 'I27 order dispatched_at ⇒ left pending (not pending)', count(*) FROM orders WHERE dispatched_at IS NOT NULL AND status = 'PENDING_ADMIN_CONFIRMATION'
UNION ALL SELECT 'I28 reminder sent ⇒ COMPLETED', count(*) FROM orders WHERE rating_reminder_sent_at IS NOT NULL AND status <> 'COMPLETED'
UNION ALL SELECT 'I29 gift fulfilled ⇒ claimed', count(*) FROM loyalty_reward_redemptions WHERE fulfilled_at IS NOT NULL AND fulfilled_at < claimed_at
UNION ALL SELECT 'I30 temporary slot pair', count(*) FROM visual_slots WHERE (temporary_image_url IS NULL) <> (temporary_until IS NULL);
ROLLBACK;
