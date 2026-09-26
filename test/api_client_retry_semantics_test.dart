// [Audit #4 — Failure/Retry] عميل الـAPI لا يعيد إرسال أي تعديل من تلقائه.
//
// سياسةُ إعادةٍ تصلح لـ`GET` تصير خطراً على `POST`/`PATCH`: طلب إنشاء الطلب
// الذي تنقطع استجابته بعد التزام الخادم يُنشئ — إن أُعيد آلياً — طلباً ثانياً
// أو يرتطم بخطأٍ لا يفهمه المستخدم. العقد المثبَّت هنا: كل تعديل يُرسل **مرةً
// واحدة** على مستوى العميل، والمهلة وانقطاع الاتصال والفشل الخادمي كلها
// تُرفع للمستدعي كـ[AppException] بلا إعادة، وبلا إنهاء جلسة.
//
// إعادة المحاولة قرارٌ للمستخدم (زرّ) أو للشاشة، لا للطبقة الشبكية.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/errors/app_exception.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';

/// محوّل يفشل بطريقةٍ مختارة ويعدّ المحاولات.
class _FailingAdapter implements HttpClientAdapter {
  _FailingAdapter(this.mode);

  /// `timeout` | `reset` | `server` | `garbage`
  final String mode;
  final List<RequestOptions> attempts = [];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    attempts.add(options);
    switch (mode) {
      case 'timeout':
        throw DioException.receiveTimeout(
          timeout: const Duration(seconds: 15),
          requestOptions: options,
        );
      case 'reset':
        throw DioException.connectionError(
          requestOptions: options,
          reason: 'connection reset',
        );
      case 'server':
        return ResponseBody.fromString(
          jsonEncode({
            'success': false,
            'data': null,
            'message': 'حدث خطأ غير متوقع',
            'error': {'code': 'INTERNAL_ERROR'},
          }),
          500,
          headers: {
            Headers.contentTypeHeader: [Headers.jsonContentType],
          },
        );
      default:
        // ردٌّ ليس JSON — فشل تحليل الاستجابة.
        return ResponseBody.fromString(
          '<html>gateway</html>',
          200,
          headers: {
            Headers.contentTypeHeader: ['text/html'],
          },
        );
    }
  }

  @override
  void close({bool force = false}) {}
}

ApiClient _client(_FailingAdapter adapter, {void Function()? onUnauthorized}) {
  final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
    ..httpClientAdapter = adapter;
  return ApiClient(
    config: AppConfig.development,
    dio: dio,
    tokenProvider: () => 'token',
    onUnauthorized: onUnauthorized,
  );
}

void main() {
  group('ApiClient — لا إعادة إرسال آلية للتعديلات', () {
    for (final mode in const ['timeout', 'reset', 'server', 'garbage']) {
      test('[CRITICAL] POST تحت «$mode»: محاولة واحدة بالضبط ثم AppException', () async {
        final adapter = _FailingAdapter(mode);
        var loggedOut = false;
        final api = _client(adapter, onUnauthorized: () => loggedOut = true);

        await expectLater(
          api.post('/orders', body: const {'governorateId': 'g'}),
          throwsA(isA<AppException>()),
        );
        expect(adapter.attempts, hasLength(1), reason: 'لا إعادة إرسال للتعديل');
        expect(adapter.attempts.single.method, 'POST');
        expect(loggedOut, isFalse, reason: 'فشل الشبكة/الخادم ليس نهاية جلسة');
      });

      test('PATCH تحت «$mode»: محاولة واحدة بالضبط', () async {
        final adapter = _FailingAdapter(mode);
        final api = _client(adapter);
        await expectLater(
          api.patch('/cart/line-1', body: const {'quantity': 2}),
          throwsA(isA<AppException>()),
        );
        expect(adapter.attempts, hasLength(1));
      });
    }

    test('المهلة تُرفع بمفتاح errTimeout وانقطاع الاتصال بمفتاح errConnection', () async {
      final timeout = _client(_FailingAdapter('timeout'));
      final reset = _client(_FailingAdapter('reset'));
      await expectLater(
        timeout.post('/orders'),
        throwsA(isA<AppException>().having((e) => e.messageKey, 'messageKey', 'errTimeout')),
      );
      await expectLater(
        reset.post('/orders'),
        throwsA(isA<AppException>().having((e) => e.messageKey, 'messageKey', 'errConnection')),
      );
    });

    test('لا معترِض إعادة محاولة مسجَّلاً في Dio', () {
      final dio = Dio(BaseOptions(baseUrl: 'http://stub.invalid/api'))
        ..httpClientAdapter = _FailingAdapter('timeout');
      ApiClient(config: AppConfig.development, dio: dio);
      // معترِض واحد (التوكن/اللغة/النسخة + إنهاء الجلسة) — لا شيء يعيد الإرسال.
      expect(dio.interceptors.whereType<InterceptorsWrapper>(), hasLength(1));
      expect(
        dio.interceptors.where((i) => i.runtimeType.toString().toLowerCase().contains('retry')),
        isEmpty,
      );
    });
  });
}
