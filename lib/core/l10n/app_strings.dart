import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../features/settings/presentation/cubit/locale_cubit.dart';

/// نصوص الواجهة بالعربية والكردية (سوراني).
///
/// [NOTE] بنية الترجمة حقيقية وقابلة للتوسّع: كل نص جديد يُضاف هنا بلغتيه.
/// النصوص المترجَمة حالياً تغطي التنقّل الرئيسي والعناوين المشتركة؛ بقية
/// شاشات التطبيق ما زالت تعرض العربية مباشرة، وتُنقل إلى هذه الطبقة تدريجياً
/// بلا أي تغيير في التصميم.
class AppStrings {
  const AppStrings._(this._values);

  final Map<String, String> _values;

  static const _ar = <String, String>{
    'navHome': 'الرئيسية',
    'navCategories': 'الأقسام',
    'navCommunity': 'المجتمع',
    'navFavorites': 'المفضلة',
    'navCart': 'السلة',
    'navAccount': 'الحساب',
    'settings': 'الإعدادات',
    'language': 'اللغة',
    'theme': 'المظهر',
    'themeLight': 'فاتح',
    'themeDark': 'داكن',
    'notifications': 'الإشعارات',
    'galaxyPoints': 'نقاط المجرّة',
    'myOrders': 'طلباتي',
    'logout': 'تسجيل الخروج',
    'cancel': 'إلغاء',
    'save': 'حفظ',
  };

  static const _ckb = <String, String>{
    'navHome': 'سەرەکی',
    'navCategories': 'بەشەکان',
    'navCommunity': 'کۆمەڵگا',
    'navFavorites': 'دڵخوازەکان',
    'navCart': 'سەبەتە',
    'navAccount': 'هەژمار',
    'settings': 'ڕێکخستنەکان',
    'language': 'زمان',
    'theme': 'ڕووکار',
    'themeLight': 'ڕووناک',
    'themeDark': 'تاریک',
    'notifications': 'ئاگادارکردنەوەکان',
    'galaxyPoints': 'خاڵەکانی گەلاکسی',
    'myOrders': 'داواکارییەکانم',
    'logout': 'چوونەدەرەوە',
    'cancel': 'پاشگەزبوونەوە',
    'save': 'پاشەکەوتکردن',
  };

  static const arabic = AppStrings._(_ar);
  static const kurdish = AppStrings._(_ckb);

  static AppStrings of(AppLanguage language) =>
      language == AppLanguage.kurdish ? kurdish : arabic;

  /// يعيد النص المترجم، أو النص العربي كاحتياط إن لم تتوفر ترجمة بعد.
  String call(String key) => _values[key] ?? _ar[key] ?? key;
}

/// وصول سريع للنصوص المترجمة حسب لغة المستخدم الحالية.
extension AppStringsContext on BuildContext {
  AppStrings get strings => AppStrings.of(watch<LocaleCubit>().state);
}
