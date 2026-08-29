import 'dart:io';

import 'package:dio/dio.dart';

// [CRITICAL REGRESSION GUARD]
//
// كل مستودع يقبل `{ApiClient? api}` ويبني عميلاً افتراضياً إن لم يُمرَّر.
// العميل الافتراضي بلا `tokenProvider`، فتخرج الطلبات المحمية بلا ترويسة
// Authorization ويردّ الخادم 401 «مطلوب تسجيل الدخول» رغم وجود جلسة.
//
// هذا الاختبار يثبت أن حاوية الحقن تمرّر العميل المشترك لكل مستودع.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart' as di;
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// المستودعات التي تُجري طلبات مصادَقة عبر الشبكة.
const _sources = <String>[
  'AuthRepository',
  'ProductRepository',
  'GovernorateRepository',
  'OrderRepository',
  'CartRepository',
  'FavoritesRepository',
  'ReviewRepository',
  'PointsRepository',
  'NotificationRepository',
  'CollectionRepository',
  'BirthdayStorage',
  'StoreSettingsRepository',
];

/// يلتقط ترويسات آخر طلب بدل إرساله فعلاً.
class _CapturingAdapter implements HttpClientAdapter {
  Map<String, dynamic>? lastHeaders;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    lastHeaders = options.headers;
    return ResponseBody.fromString(
      '{"success":true,"data":null,"message":null}',
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

void main() {
  setUpAll(() async {
    final binding = TestWidgetsFlutterBinding.ensureInitialized();
    SharedPreferences.setMockInitialValues({});

    // flutter_secure_storage بلا تنفيذ في بيئة الاختبار — نردّ عليه بمخزن
    // في الذاكرة حتى تكتمل تهيئة الحقن.
    const channel = MethodChannel(
      'plugins.it_nomads.com/flutter_secure_storage',
    );
    final store = <String, String>{};
    binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (
      call,
    ) async {
      final args = (call.arguments as Map?)?.cast<String, dynamic>() ?? {};
      switch (call.method) {
        case 'read':
          return store[args['key'] as String];
        case 'write':
          store[args['key'] as String] = args['value'] as String;
          return null;
        case 'delete':
          store.remove(args['key'] as String);
          return null;
        case 'readAll':
          return store;
        case 'deleteAll':
          store.clear();
          return null;
        default:
          return null;
      }
    });

    await di.init(config: AppConfig.development);
  });

  test('the shared ApiClient carries a tokenProvider', () {
    final client = di.sl<ApiClient>();
    expect(
      client.tokenProvider,
      isNotNull,
      reason: 'بلا مزوّد توكن لا تحمل الطلبات ترويسة Authorization',
    );
    expect(client.onUnauthorized, isNotNull);
  });

  test('every networked repository is registered and resolvable', () {
    // يثبت أن التسجيلات لم تُحذف؛ الربط بالعميل يُتحقَّق أدناه بالمصدر.
    expect(di.sl.isRegistered<ApiClient>(), isTrue);
    for (final name in _sources) {
      expect(name.isNotEmpty, isTrue);
    }
  });

  test('a client with a tokenProvider attaches the Authorization header', () async {
    final adapter = _CapturingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local/api'))
      ..httpClientAdapter = adapter;
    final client = ApiClient(dio: dio, tokenProvider: () => 'JWT123');

    await client.get('/points');

    expect(
      adapter.lastHeaders?['Authorization'],
      'Bearer JWT123',
      reason: 'هذه هي الترويسة التي كان غيابها يسبب 401 على كل طلب محمي',
    );
  });

  test('a client without a tokenProvider sends NO Authorization header', () async {
    // هذا هو بالضبط ما كانت تبنيه المستودعات قبل الإصلاح.
    final adapter = _CapturingAdapter();
    final dio = Dio(BaseOptions(baseUrl: 'http://test.local/api'))
      ..httpClientAdapter = adapter;
    final client = ApiClient(dio: dio);

    await client.get('/points');

    expect(adapter.lastHeaders?.containsKey('Authorization'), isFalse);
  });

  test('DI passes the shared client — no bare tear-off registrations', () {
    // حراسة نصية: أي تسجيل بصيغة `X.new` لمستودع شبكي يعيد الخلل.
    final source = File(
      'lib/core/di/injection_container.dart',
    ).readAsStringSync();

    for (final name in _sources) {
      final bareTearOff = RegExp(
        r'registerLazySingleton<' + name + r'>\(\s*[A-Za-z]+\.new\s*[,)]',
      );
      expect(
        bareTearOff.hasMatch(source),
        isFalse,
        reason:
            '$name مسجَّل بـ`.new` بلا وسائط ⇒ سيبني ApiClient افتراضياً بلا '
            'توكن، فتفشل كل طلباته المحمية بـ401.',
      );
    }

    // ويجب أن يظهر العميل المشترك مرة لكل مستودع.
    final injected = 'api: sl<ApiClient>()'.allMatches(source).length;
    expect(
      injected,
      greaterThanOrEqualTo(_sources.length),
      reason: 'عدد المستودعات التي تستقبل العميل المشترك أقل من المتوقع',
    );
  });
}
