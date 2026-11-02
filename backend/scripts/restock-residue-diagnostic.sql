-- Restock residue diagnostic (CA-17, STEP 57) — READ ONLY: runs inside BEGIN READ ONLY … ROLLBACK.
-- Usage: PGOPTIONS='-c default_transaction_read_only=on' \
--          psql "$DATABASE_URL" -X -q -f backend/scripts/restock-residue-diagnostic.sql
--
-- Lists every in-stock product that still carries a restock date (sweep I22, INFO) or a waiting
-- «أعلمني عند توفره» subscriber (sweep I23), with the evidence needed to decide where it came from:
--
--   origin_051  = the product's last write is migration 051's own transaction
--                 (products.updated_at is set by trg_products_updated_at to now(), which inside the
--                 runner's transaction equals schema_migrations.applied_at for 051). 051 returned stock
--                 to pending orders once, before §42.5 applied to that path, so it raised stock 0 → n
--                 without notifying or consuming subscribers and without clearing the date.
--   waiting     = subscribers that were never told the product came back. Current code cannot create
--                 these on an in-stock product: every 0 → n path calls restockService.stockReturned
--                 (admin save, rejection release — D2) and a subscription is refused on an in-stock
--                 product under a FOR SHARE lock (CA-17a). A row here is historical residue.
--   date_only   = a restock date with no waiting subscriber. Not residue by itself: the dashboard lets
--                 the admin pre-set a date on an in-stock product («المخزون يتقدّم على الموعد»).
--
-- Nothing here writes. The remediation is a product decision (notify now vs clear silently) — see
-- STEP 57 (CA-17) in PROJECT_FEATURE_SPEC.md. It is NOT a migration and must never run automatically.
BEGIN READ ONLY;

SELECT name AS migration, applied_at FROM schema_migrations WHERE name = '051_unreserve_pending_orders.sql';

SELECT p.id,
       p.name,
       p.stock,
       p.restock_at,
       p.restock_at < now()                                     AS date_in_past,
       p.updated_at,
       p.updated_at = m.applied_at                              AS origin_051,
       (SELECT count(*) FROM restock_subscriptions rs WHERE rs.product_id = p.id)          AS waiting,
       (SELECT min(rs.created_at) FROM restock_subscriptions rs WHERE rs.product_id = p.id) AS oldest_subscription,
       CASE
         WHEN EXISTS (SELECT 1 FROM restock_subscriptions rs WHERE rs.product_id = p.id) THEN 'residue'
         ELSE 'date_only'
       END                                                      AS classification
  FROM products p
  LEFT JOIN schema_migrations m ON m.name = '051_unreserve_pending_orders.sql'
 WHERE p.stock > 0
   AND (p.restock_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM restock_subscriptions rs WHERE rs.product_id = p.id))
 ORDER BY classification DESC, p.updated_at;

-- The customers a «notify now» remediation would reach (per product, with their app language).
SELECT rs.product_id, rs.user_id, u.preferred_language, rs.created_at AS subscribed_at
  FROM restock_subscriptions rs
  JOIN products p ON p.id = rs.product_id
  JOIN users u ON u.id = rs.user_id
 WHERE p.stock > 0
 ORDER BY rs.product_id, rs.created_at;

ROLLBACK;
