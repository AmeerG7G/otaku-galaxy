import 'dart:async';
import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/di/injection_container.dart' as di;
import 'core/design_system/design_system.dart';

/// تهيئة التطبيق مع معالجة أخطاء شاملة وحقن الاعتماديات.
Future<void> bootstrap(FutureOr<Widget> Function() builder) async {
  await runZonedGuarded(
    () async {
      // [NOTE]: منع أخطاء المنطقة من إنهاء التطبيق (يجب قبل ensureInitialized).
      BindingBase.debugZoneErrorsAreFatal = false;

      WidgetsFlutterBinding.ensureInitialized();

      // إعداد معالجة الأخطاء العامة والتفضيلات النظامية.
      _setupErrorHandling();
      await _setupSystemPreferences();

      // تهيئة حقن الاعتماديات.
      await di.init();

      // تشغيل التطبيق داخل نفس المنطقة.
      runApp(await builder());
    },
    (error, stackTrace) {
      log('Uncaught error: $error', stackTrace: stackTrace);
    },
  );
}

/// معالجة أخطاء Flutter وغيرها من أخطاء النظام الأساسي.
void _setupErrorHandling() {
  FlutterError.onError = (FlutterErrorDetails details) {
    log(
      'Flutter Error: ${details.exceptionAsString()}',
      stackTrace: details.stack,
    );
    if (kDebugMode) {
      FlutterError.presentError(details);
    }
  };

  PlatformDispatcher.instance.onError = (error, stack) {
    log('Platform Error: $error', stackTrace: stack);
    return true;
  };
}

/// ضبط اتجاه الشاشة وألوان أشرطة النظام.
Future<void> _setupSystemPreferences() async {
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // [CRITICAL] شريط النظام السفلي **شفاف** لا أبيض.
  //
  // كان `systemNavigationBarColor: Colors.white` يطلي منطقة تنقّل أندرويد
  // بالأبيض الصمّاء، فتظهر شريطاً فاتحاً يبدو جزءاً من التطبيق أسفل شريط
  // التنقّل الخاص به — وهي بالضبط الشكوى. ومع `edgeToEdge` لا معنى لطلائها
  // أصلاً: الوضع موجودٌ ليمتدّ محتوى التطبيق تحتها ويرسم النظامُ مؤشّره
  // فوقه.
  //
  // وكان اللون ثابتاً يُضبط مرة واحدة عند الإقلاع، فيبقى أبيض في الوضع
  // الداكن، وتبقى أيقونات شريط الحالة داكنةً على خلفية داكنة أي غير
  // مرئية. الأسلوب الآن يُشتقّ من الثيم في `OtakuGalaxyApp` عبر
  // `AnnotatedRegion`، فيتبدّل مع تبدّل المظهر — وما يُضبط هنا هو الحدّ
  // الآمن قبل أن تُبنى الشجرة.
  SystemChrome.setSystemUIOverlayStyle(otakuSystemOverlay(Brightness.light));

  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
}
