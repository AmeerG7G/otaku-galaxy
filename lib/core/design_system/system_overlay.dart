import 'package:flutter/material.dart' show Colors;
import 'package:flutter/services.dart';

/// أسلوب أشرطة النظام الموافق لمظهر التطبيق.
///
/// [CRITICAL] الشفافية شرطٌ لا تفضيل. التطبيق يعمل في وضع `edgeToEdge`، أي
/// أن محتواه يمتدّ تحت شريطَي النظام ويرسم النظامُ عناصره فوقه. أي لون صمّاء
/// هنا يصير مستطيلاً يبدو جزءاً من التطبيق: أبيضَ في الوضع الداكن، أو شريطاً
/// فاتحاً أسفل شريط التنقّل الخاص بالتطبيق.
///
/// وسطوع الأيقونات معكوسٌ عن سطوع الخلفية: على خلفية فاتحة تُرسم أيقونات
/// داكنة، وعلى داكنة فاتحة. ضبطُه ثابتاً — كما كان — يجعل نصفَ المستخدمين
/// يرون أيقونات نظامٍ غير مرئية.
///
/// [NOTE] `systemNavigationBarColor` مُهمَل من أندرويد ١٥ فصاعداً مع
/// `edgeToEdge`؛ يبقى هنا للأجهزة الأقدم، وقيمته الشفافة هي الصحيحة على
/// الاثنين معاً. ولا حشوة سفلية ثابتة في أي مكان — المسافة تأتي من
/// `MediaQuery.viewPadding` عبر `SafeArea` في شريط التنقّل نفسه، فتعمل مع
/// الإيماءات ومع الأزرار الثلاثة ومع مؤشّر الإيماءة على حدٍّ سواء.
SystemUiOverlayStyle otakuSystemOverlay(Brightness brightness) {
  final isLight = brightness == Brightness.light;
  final iconBrightness = isLight ? Brightness.dark : Brightness.light;
  return SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: iconBrightness,
    // iOS يقرأ `statusBarBrightness` لا `statusBarIconBrightness`، وهو
    // سطوع **الخلفية** لا الأيقونات — فيُعكس.
    statusBarBrightness: brightness,
    systemNavigationBarColor: Colors.transparent,
    systemNavigationBarDividerColor: Colors.transparent,
    systemNavigationBarIconBrightness: iconBrightness,
    systemNavigationBarContrastEnforced: false,
  );
}
