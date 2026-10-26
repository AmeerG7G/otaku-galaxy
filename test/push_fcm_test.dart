// الإشعارات الفورية عبر FCM (STEP 64 §13) — كل ما لا يحتاج جهازاً حقيقياً:
// الإعداد من `--dart-define`، مصدر الرمز (بفايربيس مزيَّف)، وجهة اللمس،
// عرض المقدّمة، والتوصيل في المنصّة (البيان، Gradle، الإقلاع).
//
// [LIMIT] الاستلام الفعلي على جهاز يحتاج مشروع Firebase واعتماده — لا
// يُدّعى هنا.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:auto_route/auto_route.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/notifications/data/push_registrar.dart';
import 'package:otaku_galaxy/features/notifications/data/push_token_repository.dart';
import 'package:otaku_galaxy/features/notifications/push/firebase_push.dart';
import 'package:otaku_galaxy/features/notifications/push/firebase_push_config.dart';
import 'package:otaku_galaxy/features/notifications/push/push_tap_router.dart';

class _FakeMessaging implements PushMessaging {
  _FakeMessaging({
    this.granted = true,
    this.token = 'fcm-token-1',
    this.fail = false,
  });

  bool granted;
  String? token;
  bool fail;
  int permissionRequests = 0;
  int tokenRequests = 0;
  final refresh = StreamController<String>.broadcast();

  @override
  Future<bool> requestPermission() async {
    permissionRequests++;
    if (fail) throw StateError('platform channel down');
    return granted;
  }

  @override
  Future<String?> getToken() async {
    tokenRequests++;
    return token;
  }

  @override
  Stream<String> get onTokenRefresh => refresh.stream;
}

class _SpyRepository implements PushTokenRepository {
  final registered = <String>[];

  @override
  Future<void> register(String token) async => registered.add(token);

  @override
  Future<void> unregister(String token) async {}

  @override
  Future<List<Map<String, dynamic>>> mine() async => const [];
}

void main() {
  group('إعداد Firebase من --dart-define', () {
    test('بلا defines (كل بناءٍ حاليّ): غير مضبوط', () {
      expect(FirebasePushConfig.fromEnvironment.isConfigured, isFalse);
    });

    test('الأربعة كلّها أو لا شيء', () {
      const full = FirebasePushConfig(
        apiKey: ' key ',
        appId: '1:2:android:3',
        projectId: 'otaku-galaxy',
        messagingSenderId: '2',
      );
      expect(full.isConfigured, isTrue);
      expect(full.toOptions().apiKey, 'key');
      expect(full.toOptions().projectId, 'otaku-galaxy');
      for (final partial in const [
        FirebasePushConfig(
          apiKey: 'k',
          appId: 'a',
          projectId: 'p',
          messagingSenderId: '',
        ),
        FirebasePushConfig(
          apiKey: '  ',
          appId: 'a',
          projectId: 'p',
          messagingSenderId: 's',
        ),
      ]) {
        expect(partial.isConfigured, isFalse);
      }
    });

    test(
      '[CRITICAL] غير مضبوط: التهيئة لا تلمس Firebase ولا ترمي، والمصدر يبقى غير مضبوط',
      () async {
        final ready = await initPushNotifications(
          tapRouter: PushTapRouter((_) async => null),
          config: const FirebasePushConfig(
            apiKey: '',
            appId: '',
            projectId: '',
            messagingSenderId: '',
          ),
        );
        expect(ready, isFalse);
        expect(pushNotificationsReady, isFalse);
      },
    );
  });

  group('FirebasePushTokenSource', () {
    test('الإذن مرفوض: لا رمز ولا طلب رمز', () async {
      final fcm = _FakeMessaging(granted: false);
      expect(
        await FirebasePushTokenSource(fcm).requestPermissionAndGetToken(),
        isNull,
      );
      expect(fcm.tokenRequests, 0);
    });

    test('الإذن ممنوح: الرمز', () async {
      final fcm = _FakeMessaging();
      expect(
        await FirebasePushTokenSource(fcm).requestPermissionAndGetToken(),
        'fcm-token-1',
      );
    });

    test(
      'رمزٌ فارغ أو قناةٌ معطوبة: null لا استثناء (الدخول لا يتعطّل)',
      () async {
        expect(
          await FirebasePushTokenSource(
            _FakeMessaging(token: ''),
          ).requestPermissionAndGetToken(),
          isNull,
        );
        expect(
          await FirebasePushTokenSource(
            _FakeMessaging(fail: true),
          ).requestPermissionAndGetToken(),
          isNull,
        );
      },
    );

    test('مع PushRegistrar: الرمز يُسجَّل، وتدويره يُعاد تسجيله', () async {
      final fcm = _FakeMessaging();
      final repo = _SpyRepository();
      final registrar = PushRegistrar(FirebasePushTokenSource(fcm), repo);
      await registrar.onLogin();
      expect(repo.registered, ['fcm-token-1']);
      fcm.refresh.add('fcm-token-2');
      await Future<void>.delayed(Duration.zero);
      expect(repo.registered, ['fcm-token-1', 'fcm-token-2']);
      await registrar.dispose();
    });
  });

  group('وجهة اللمس — بقاعدة قائمة الإشعارات', () {
    test('الطلب أولاً ثم المنتج، ولا وجهة لما سواهما', () {
      final order = routeForPushData({
        'orderId': 'o-1',
        'productId': 'p-1',
        'type': 'orderShipped',
      });
      expect(order, isA<OrderDetailRoute>());
      expect((order! as OrderDetailRoute).args!.orderId, 'o-1');

      final product = routeForPushData({
        'productId': ' p-2 ',
        'type': 'backInStock',
      });
      expect(product, isA<ProductDetailRoute>());
      expect((product! as ProductDetailRoute).args!.productId, 'p-2');

      for (final none in <Map<String, Object?>>[
        {},
        {'type': 'promotion', 'notificationId': 'n-1'},
        {'orderId': '', 'productId': '  '},
        {'orderId': 42},
      ]) {
        expect(routeForPushData(none), isNull, reason: '$none');
      }
    });

    test(
      '[CRITICAL] لمسةٌ قبل جاهزية الواجهة تُحفظ وتُفتح عند الجاهزية — مرّةً واحدة',
      () {
        final pushed = <PageRouteInfo<Object?>>[];
        final router = PushTapRouter((route) async {
          pushed.add(route);
          return null;
        });
        router.handle({'orderId': 'o-1'});
        router.handle({'productId': 'p-9'});
        expect(
          pushed,
          isEmpty,
          reason: 'شاشة البداية ستستبدل نفسها — لا دفع فوقها',
        );
        router.markReady();
        expect(pushed, hasLength(1));
        expect(
          (pushed.single as ProductDetailRoute).args!.productId,
          'p-9',
          reason: 'الأحدث يفوز',
        );
        router.markReady();
        expect(pushed, hasLength(1));
        router.handle({'orderId': 'o-2'});
        expect(pushed, hasLength(2), reason: 'بعد الجاهزية: فوراً');
        router.handle({'type': 'promotion'});
        expect(pushed, hasLength(2));
      },
    );
  });

  group('العرض والتطبيق في المقدّمة', () {
    test('العنوان والنصّ من `notification`، والحمولة `data` كاملةً للّمس', () {
      final shown = foregroundNotificationFor(
        const RemoteMessage(
          messageId: 'm-1',
          notification: RemoteNotification(
            title: 'طلبك في الطريق',
            body: 'سيصلك اليوم',
          ),
          data: {'orderId': 'o-1', 'type': 'orderShipped'},
        ),
      )!;
      expect(shown.title, 'طلبك في الطريق');
      expect(shown.body, 'سيصلك اليوم');
      expect(shown.id, isNonNegative);
      expect(jsonDecode(shown.payload), {
        'orderId': 'o-1',
        'type': 'orderShipped',
      });
    });

    test('رسالة بلا نصّ لا تُعرض إشعاراً فارغاً', () {
      expect(
        foregroundNotificationFor(
          const RemoteMessage(data: {'orderId': 'o-1'}),
        ),
        isNull,
      );
    });
  });

  group('التوصيل في المنصّة', () {
    test('الإقلاع يهيّئ الإشعارات بعد الحقن وقبل runApp', () {
      final source = File('lib/bootstrap.dart').readAsStringSync();
      final init = source.indexOf('await di.init(config: config);');
      final push = source.indexOf('await initPushNotifications(');
      final run = source.indexOf('runApp(');
      expect(init, isNonNegative);
      expect(push, greaterThan(init));
      expect(run, greaterThan(push));
    });

    test('البيان: إذن أندرويد 13 والقناة الافتراضية نفسها', () {
      final manifest = File(
        'android/app/src/main/AndroidManifest.xml',
      ).readAsStringSync();
      expect(manifest, contains('android.permission.POST_NOTIFICATIONS'));
      expect(
        manifest,
        matches(
          RegExp(
            'default_notification_channel_id"\\s*android:value="$kPushChannelId"',
          ),
        ),
      );
      // الخادم يرسل إلى القناة نفسها.
      final backend = File(
        'backend/src/services/push/index.ts',
      ).readAsStringSync();
      expect(backend, contains("'$kPushChannelId'"));
    });

    test(
      'Gradle: desugaring مفعَّل، ولا ملحق google-services ولا ملفّ إعداد في Git',
      () {
        final gradle = File('android/app/build.gradle.kts').readAsStringSync();
        expect(gradle, contains('isCoreLibraryDesugaringEnabled = true'));
        expect(gradle, contains('coreLibraryDesugaring('));
        expect(gradle, isNot(contains('google-services')));
        expect(File('android/app/google-services.json').existsSync(), isFalse);
      },
    );
  });
}
