-- 051_unreserve_pending_orders.sql
--
-- تسويةٌ لمرّة واحدة تصاحب نقلَ تنزيل المخزون من **إرسال الطلب** إلى
-- **قبول الإدارة** (قرار عمل 2026-09-14؛ انظر `consumeStockOnApproval` في
-- `orderService`).
--
-- [CRITICAL] كل طلبٍ واقف في `PENDING_ADMIN_CONFIRMATION` لحظةَ تطبيق هذه
-- الهجرة أُنشئ تحت النموذج القديم، أي أن كمياته نُزِّلت من `products.stock`
-- عند إرساله. الشيفرة الجديدة تفترض أن المنتظر لا يحجز شيئاً وستنزّل
-- كمياته ثانيةً عند القبول — فتُباع القطعة مرتين، أو يُرفض القبول
-- بـ`INSUFFICIENT_STOCK` لمنتجٍ مخزونه صفر بسبب الحجز القديم نفسه.
--
-- الإصلاح: إعادة كميات المنتظر إلى المخزون مرةً واحدة، مجموعةً على
-- المنتج. المرفوض أُرجع أصلاً في النموذج القديم، والمقبول (خرج من الانتظار)
-- مستهلَكٌ بحق — لا يُمسّ أيٌّ منهما. السطر الذي حُذف منتجه من القاعدة
-- (`product_id` فارغ) لا شيء يُرجَع إليه.
--
-- [CRITICAL] **ليست آمنة للتكرار**: هي فرقٌ يُضاف لا قيمةٌ تُشتقّ. هويّة
-- الهجرة اسمُ ملفّها في `schema_migrations` (قيد UNIQUE) فلا يطبّقها
-- المُهاجِر مرتين — لا يُعاد تسمية هذا الملفّ أبداً. وتُطبَّق **قبل** تشغيل
-- الشيفرة الجديدة (`db:migrate` ثم `start`، كما في README): طلبٌ يُنشئه
-- الخادم القديم بعد الهجرة يبقى محجوزاً بلا تسوية.

UPDATE products p
   SET stock = p.stock + reserved.quantity
  FROM (
    SELECT oi.product_id, SUM(oi.quantity)::int AS quantity
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
     WHERE o.status = 'PENDING_ADMIN_CONFIRMATION'
       AND oi.product_id IS NOT NULL
     GROUP BY oi.product_id
  ) reserved
 WHERE p.id = reserved.product_id;
