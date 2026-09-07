-- 044_restock_schedule_notification.sql
-- إشعار «موعد التوفر المتوقع» — نوع جديد، بلا عمود جديد.
--
-- ═══ لا حقل جديد للتاريخ ═══
--
-- `products.restock_at TIMESTAMPTZ` موجود منذ الهجرة ٠٣٤ ويحمل بالضبط ما
-- تحتاجه هذه الميزة: «سيعود للتوفر بتاريخ…» يضبطه المسؤول. يُعاد استعماله
-- كما هو ولا يُضاف مقابلٌ له.
--
-- [CRITICAL] ولا يُنسخ التاريخ داخل `restock_subscriptions`. التاريخ صفةُ
-- المنتج لا صفةُ اشتراك: نسخُه في كل صفّ اشتراك يعني أن تعديل المسؤول
-- للموعد يترك مئة نسخة قديمة تُعرض للزبائن بعد أن تغيّر الموعد فعلاً.
-- المنتج هو مصدر الحقيقة، والاشتراك يقول «من ينتظر» لا «متى».
--
-- ═══ نوع الإشعار ═══
--
-- `backInStock` يعني «عاد المنتج فعلاً» — حدثٌ مختلف تماماً عن «يُتوقَّع أن
-- يعود». خلطهما كان سيجعل الزبون يقرأ «عاد للتوفر» عن منتج ما زال نافداً،
-- ويكسر كذلك دلالة الإشعار القائم الذي يستهلك الاشتراك عند وصوله.
--
-- نوعٌ واحد يكفي للحالتين (تحديد الموعد وتعديله): الفرق بينهما في النصّ لا
-- في التصنيف — كلاهما «موعدٌ متوقَّع» يفتح المنتجَ نفسه عند الضغط.
ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'orderAccepted', 'orderRejected', 'deliveryUpdate', 'receiptReminder',
    'reviewApproved', 'reviewRejected', 'backInStock', 'promotion',
    'rewardClaimed', 'restockScheduled'
  ));
