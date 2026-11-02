-- يعكس 089_one_level_reward_per_order.sql — يُسقط الحارسين وحدهما: الزناد
-- ودالته والفهرس الفريد. لا بيانات تُمسّ: الطلبات والمزايا تبقى كما حُفظت،
-- والخدمة تبقى تختار مزيّةً واحدة لكل طلب (القاعدة في الشيفرة، هذا سندها).
-- معاملةٌ واحدة: الكل أو لا شيء.
BEGIN;
DROP TRIGGER IF EXISTS trg_orders_one_level_reward ON orders;
DROP FUNCTION IF EXISTS orders_one_level_reward();
DROP INDEX IF EXISTS uq_loyalty_reward_consumed_order;
DELETE FROM schema_migrations WHERE name = '089_one_level_reward_per_order.sql';
COMMIT;
