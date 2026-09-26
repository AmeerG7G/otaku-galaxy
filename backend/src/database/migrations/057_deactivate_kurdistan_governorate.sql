-- 057_deactivate_kurdistan_governorate.sql
-- كردستان منطقة (إقليم) لا محافظة — تضم أربيل والسليمانية ودهوك الثلاث محافظات.
-- القائمة المعتمدة 18 محافظة فقط، فكردستان تُعطّل ولا تُحذف
-- (قد تكون لها طلبات/مناطق مرتبطة — ON DELETE RESTRICT).

UPDATE governorates
SET is_active = FALSE,
    updated_at = now()
WHERE name = 'كردستان';