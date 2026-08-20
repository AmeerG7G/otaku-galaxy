import 'dart:async';
import 'dart:developer';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'core/di/injection_container.dart' as di;

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

  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.dark,
      systemNavigationBarColor: Colors.white,
      systemNavigationBarIconBrightness: Brightness.dark,
    ),
  );

  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
}
