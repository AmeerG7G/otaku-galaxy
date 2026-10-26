-- 041_reward_claim_notification.sql
-- نوع إشعار جديد: تسجيل المطالبة بمزيّة مستوى.
--
-- مطالبةُ الزبون بهدية تُنشئ التزاماً على المتجر يُنفَّذ يدوياً لاحقاً، فلا
-- يجوز أن تمرّ بلا أثر يراه صاحبها. النوع مستقل ولا يُحشر في `promotion`:
-- ذاك تصنيفٌ ترويجي معطَّل افتراضياً في تفضيلات الزبون، فكان إخفاءُ تأكيدٍ
-- طلبه بنفسه خلف مفتاح دعايةٍ أغلقه.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'orderAccepted', 'orderRejected', 'deliveryUpdate', 'receiptReminder',
    'reviewApproved', 'reviewRejected', 'backInStock', 'promotion',
    'rewardClaimed'
  ));
