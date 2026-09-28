import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/constants/api_endpoints.dart';
import '../../../core/network/api_client.dart';
import '../domain/app_version.dart';
import '../domain/app_version_config.dart';
import 'installed_version.dart';

/// نتيجة فحص النسخة عند الإقلاع.
class AppVersionCheck {
  const AppVersionCheck({
    required this.updateRequired,
    required this.installedVersion,
    required this.config,
  });

  final bool updateRequired;
  final String installedVersion;
  final AppVersionConfig config;

  static const allowed = AppVersionCheck(
    updateRequired: false,
    installedVersion: '',
    config: AppVersionConfig.empty,
  );
}

/// يقرأ إعدادات النسخة من الخادم ويقرّر إن كان التحديث إجبارياً.
class AppVersionRepository {
  AppVersionRepository(this._api, this._installed, this._prefs) {
    _api.onUpdateRequired = () => serverRejections.value++;
  }

  /// يرتفع كلما ردّ الخادم طلباً بـ426 `APP_UPDATE_REQUIRED` — يسمعه
  /// `ForceUpdateGate` فيعيد الفحص فوراً بدل انتظار الاستئناف التالي.
  final ValueNotifier<int> serverRejections = ValueNotifier<int>(0);

  final ApiClient _api;
  final InstalledVersionSource _installed;
  final SharedPreferences _prefs;

  /// آخر إعداد وصل من الخادم — يُحفظ ليصمد الحجب عبر إعادة التشغيل.
  static const _cacheKey = 'app_version_config_v1';

  String? _installedVersion;

  /// النسخة المثبَّتة كما ستُعلَن للخادم، أو نصّ فارغ إن تعذّرت قراءتها.
  Future<String> installedVersion() async {
    final cached = _installedVersion;
    if (cached != null) return cached;
    try {
      return _installedVersion = await _installed.version();
    } catch (_) {
      // تعذّرت قناة المنصّة: نسخة مجهولة لا تُقارَن ولا تُحجب.
      return _installedVersion = '';
    }
  }

  /// آخر إعداد ناجح محفوظ محلياً، أو الفارغ إن لم يصل شيء بعد.
  AppVersionConfig cachedConfig() {
    final raw = _prefs.getString(_cacheKey);
    if (raw == null || raw.isEmpty) return AppVersionConfig.empty;
    try {
      return AppVersionConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return AppVersionConfig.empty;
    }
  }

  /// يفحص النسخة مقابل الخادم.
  ///
  /// [CRITICAL] فشلُ الشبكة **لا يحجب**: يُرجَع إلى آخر إعدادٍ نجح، وإن لم
  /// يوجد فلا حجب البتّة. حجبُ من تعذّر عليه الوصول للخادم يعني إقفال
  /// التطبيق على كل مستخدميه لحظةَ تعطُّل الخادم — وهو ضررٌ أكبر بكثير من
  /// أن يستعمل أحدهم نسخةً قديمة يوماً إضافياً. والخادم نفسه يرفض العمليات
  /// المحميّة من النسخ القديمة، فالحاجز الحقيقي لا يسقط مع هذا التساهل.
  ///
  /// وفي المقابل: ما دام آخر ردٍّ **ناجح** من الخادم قال «هذه النسخة دون
  /// الحدّ»، يبقى الحجب قائماً بعد إعادة التشغيل وبلا شبكة — وإلا لكان
  /// إطفاءُ الإنترنت وسيلةَ تجاوزٍ من سطرين.
  Future<AppVersionCheck> check() async {
    final installed = await installedVersion();

    AppVersionConfig config;
    try {
      final data = await _api.get(ApiEndpoints.appVersion);
      config = AppVersionConfig.fromJson(
        (data as Map<String, dynamic>?) ?? const {},
      );
      await _prefs.setString(_cacheKey, jsonEncode(config.toJson()));
    } catch (_) {
      config = cachedConfig();
    }

    return AppVersionCheck(
      updateRequired: isUpdateRequired(
        installed: installed,
        minimum: config.minimumSupportedVersion,
      ),
      installedVersion: installed,
      config: config,
    );
  }

  /// الحكم المحفوظ — يُقرأ قبل أي نداء شبكة فيظهر الحاجز فوراً عند الإقلاع
  /// بدل أن يومض المحتوى ثم يُحجب.
  Future<AppVersionCheck> cachedCheck() async {
    final installed = await installedVersion();
    final config = cachedConfig();
    return AppVersionCheck(
      updateRequired: isUpdateRequired(
        installed: installed,
        minimum: config.minimumSupportedVersion,
      ),
      installedVersion: installed,
      config: config,
    );
  }
}
