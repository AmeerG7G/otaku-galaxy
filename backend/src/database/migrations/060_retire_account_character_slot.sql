-- 060_retire_account_character_slot.sql
-- إزالة فتحة «شخصية الحساب» (account_character) من الفهرس.
--
-- ═══ القرار ═══
-- بطاقة دعوة الزائر في شاشة الحساب لم تعد تعرض شخصيةً؛ الزائر يرى تدرّجاً
-- ملوناً ونصّاً فقط. الفتحة (account_character) لا مستهلك لها في كود فلاتر
-- بعد إزالة `ManagedArtwork` من `_GuestCard` (الهجرة 060 Flutter).
-- المسؤول لا يعود يرى هذه الفتحة في اللوحة، وصورتها تسقط تلقائياً
-- (ON DELETE CASCADE) — صورة المرفوع والملفات على القرص تبقى كما هي.
DELETE FROM visual_slots
 WHERE slot_key = 'account_character';

-- ═══ ملاحظة ═══
-- الفتحة `notifications_header_character` تبقى نشطة — هي فتحة منفصلة
-- لرسوم ترويسة شاشة الإشعارات، ومستهلكة في `notifications_screen.dart`.
