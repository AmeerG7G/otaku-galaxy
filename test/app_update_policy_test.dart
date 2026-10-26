// سياسة التحديث من اللوحة (STEP 70): الاختياري، والرابط الموثوق، وإعادة المحاولة.
//
// [CRITICAL] الوجهان كما في إجبار التحديث: الإجباري لا يُتجاوز (STEP 64،
// `force_update_gate_test.dart`)، والاختياري لا يحجب أبداً — يطفو فوق
// تطبيقٍ حيّ ويُغلق مرّةً لكل إصدار. والرابط متجرٌ رسمي وإلا فلا رابط.

import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/app_update/data/app_version_repository.dart';
import 'package:otaku_galaxy/features/app_update/data/installed_version.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version_config.dart';
import 'package:otaku_galaxy/features/app_update/domain/store_url.dart';
import 'package:otaku_galaxy/features/app_update/presentation/force_update_gate.dart';
import 'package:otaku_galaxy/features/app_update/presentation/screens/force_update_screen.dart';
import 'package:otaku_galaxy/features/app_update/presentation/widgets/optional_update_prompt.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _play = 'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy';

/// `/catalog/app-version` بردٍّ يضبطه الاختبار، أو ساقط.
class _Server implements HttpClientAdapter {
  _Server(this.body);

  Map<String, Object?> body;
  bool down = false;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    calls += 1;
    if (down) {
      throw DioException.connectionError(requestOptions: options, reason: 'down');
    }
    return ResponseBody.fromString(
      jsonEncode({'success': true, 'data': body, 'message': null}),
      200,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Map<String, Object?> _optional(String latest) => {
  'forceUpdateEnabled': false,
  'minimumSupportedVersion': '',
  'latestVersion': latest,
  'updateMode': 'optional',
  'updateUrl': _play,
};

Map<String, Object?> _mandatory(String minimum, String latest) => {
  'forceUpdateEnabled': true,
  'minimumSupportedVersion': minimum,
  'latestVersion': latest,
  'updateMode': 'mandatory',
  'updateUrl': _play,
};

Future<AppVersionRepository> _repo(_Server server, {String installed = '1.0.0'}) async =>
    AppVersionRepository(
      ApiClient(
        dio: Dio(BaseOptions(baseUrl: 'https://test.local/api'))..httpClientAdapter = server,
      ),
      StaticInstalledVersion(installed),
      await SharedPreferences.getInstance(),
    );

/// يعدّ مرّات تركيب التطبيق تحت الحاجز: ظهور التنبيه واختفاؤه لا يعيده.
class _App extends StatefulWidget {
  const _App();
  static int mounts = 0;
  @override
  State<_App> createState() => _AppState();
}

class _AppState extends State<_App> {
  @override
  void initState() {
    super.initState();
    _App.mounts += 1;
  }

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: Text('محتوى التطبيق')));
}

Widget _gate(AppVersionRepository repository, {String runId = 'run'}) => MaterialApp(
  theme: AppTheme.light,
  locale: const Locale('ar'),
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: ForceUpdateGate(
      key: ValueKey(runId),
      repository: repository,
      child: const _App(),
    ),
  ),
);

final _promptTitle = AppStrings.arabic('updateAvailableTitle');

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
    _App.mounts = 0;
  });

  group('[SECURITY] الرابط الموثوق', () {
    test('صفحة تطبيقنا على Google Play تُقبل بشكلها القانوني', () {
      expect(trustedStoreUrl(_play), _play);
      expect(trustedStoreUrl(' $_play&hl=ar#reviews '), _play);
      expect(
        trustedStoreUrl('https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.staging'),
        'https://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy.staging',
      );
      expect(trustedStoreUrl('https://apps.apple.com/app/id1#x'), 'https://apps.apple.com/app/id1');
    });

    test('كل ما سواها يُرفض — لا موقع ولا ملف ولا مخطّط آخر', () {
      for (final bad in [
        null,
        '',
        'javascript:alert(1)',
        'market://details?id=com.otakugalaxy.otaku_galaxy',
        'http://play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
        'https://play.google.com.evil.example/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
        'https://evil.example/play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
        'https://user:pw@play.google.com/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
        'https://play.google.com:8443/store/apps/details?id=com.otakugalaxy.otaku_galaxy',
        'https://play.google.com/store/apps/dev?id=com.otakugalaxy.otaku_galaxy',
        'https://play.google.com/store/apps/details?id=com.evil.app',
        '$_play&id=com.evil.app',
        'https://example.com/app.apk',
      ]) {
        expect(trustedStoreUrl(bad), isNull, reason: '$bad');
      }
    });

    test('[CRITICAL] الحِزم = الخادم = build.gradle.kts', () {
      final server = File('backend/src/utils/playStoreUrl.ts').readAsStringSync();
      final block = RegExp(r'APP_PACKAGE_IDS = \[([\s\S]*?)\]').firstMatch(server)!.group(1)!;
      final serverIds = RegExp(r"'([^']+)'").allMatches(block).map((m) => m.group(1)!).toSet();
      expect(appPackageIds, serverIds);

      final gradle = File('android/app/build.gradle.kts').readAsStringSync();
      final base = RegExp(r'applicationId\s*=\s*"([^"]+)"').firstMatch(gradle)!.group(1)!;
      final suffixes = RegExp(r'applicationIdSuffix\s*=\s*"([^"]+)"').allMatches(gradle).map((m) => m.group(1)!);
      expect(appPackageIds, {base, for (final s in suffixes) '$base$s'});
    });
  });

  group('قراءة السياسة', () {
    test('اختياري: أحدث إصدار بلا حدّ أدنى', () {
      final config = AppVersionConfig.fromJson(_optional('1.4.0'));
      expect(config.latestVersion, '1.4.0');
      expect(config.minimumSupportedVersion, '');
      expect(config.updateUrl, _play);
    });

    test('`updateMode: none` يُسقط أحدث إصدار — لا تنبيه', () {
      final config = AppVersionConfig.fromJson({..._optional('1.4.0'), 'updateMode': 'none'});
      expect(config.latestVersion, '');
    });

    test('[SECURITY] رابطٌ ليس متجراً رسمياً لا يصل إلى الزرّ؛ والرابط القديم الموثوق يُستعمل', () {
      expect(
        AppVersionConfig.fromJson({..._mandatory('1.2.0', '1.2.0'), 'updateUrl': 'https://example.com/app.apk'}).updateUrl,
        '',
      );
      expect(
        AppVersionConfig.fromJson({
          'minimumSupportedVersion': '1.2.0',
          'updateUrl': 'https://evil.example/x',
          'androidStoreUrl': _play,
        }, isIos: false).updateUrl,
        _play,
      );
    });

    test('المخبّأ يحمل أحدث إصدار', () {
      const config = AppVersionConfig(minimumSupportedVersion: '1.1.0', latestVersion: '1.2.0', updateUrl: _play);
      final back = AppVersionConfig.fromJson(config.toJson());
      expect([back.minimumSupportedVersion, back.latestVersion, back.updateUrl], ['1.1.0', '1.2.0', _play]);
    });
  });

  group('حكم المستودع', () {
    test('دون أحدث إصدار وليست دون الحدّ ← تنبيه لا حجب', () async {
      final check = await (await _repo(_Server(_mandatory('1.0.0', '1.2.0')))).check();
      expect([check.updateRequired, check.updateAvailable, check.fromServer], [false, true, true]);
    });

    test('دون الحدّ ← حجبٌ وحده، لا تنبيه فوقه', () async {
      final check = await (await _repo(_Server(_mandatory('1.1.0', '1.2.0')))).check();
      expect([check.updateRequired, check.updateAvailable], [true, false]);
    });

    test('تساوي أحدث إصدار أو أحدث منه ← لا شيء', () async {
      for (final installed in ['1.2.0', '1.3.0']) {
        final check = await (await _repo(_Server(_optional('1.2.0')), installed: installed)).check();
        expect([check.updateRequired, check.updateAvailable], [false, false], reason: installed);
      }
    });

    test('الخادم ساقط ← `fromServer: false` ولا حجب بلا حكمٍ سابق', () async {
      final server = _Server(_mandatory('9.0.0', '9.0.0'))..down = true;
      final check = await (await _repo(server)).check();
      expect([check.updateRequired, check.fromServer], [false, false]);
    });

    test('الإغلاق يُحفظ لإصداره', () async {
      final repo = await _repo(_Server(_optional('1.2.0')));
      expect(repo.dismissedPromptVersion(), '');
      await repo.dismissPrompt('1.2.0');
      expect((await _repo(_Server(_optional('1.2.0')))).dismissedPromptVersion(), '1.2.0');
    });
  });

  group('الحاجز: التنبيه الاختياري', () {
    testWidgets('[CRITICAL] يطفو فوق تطبيقٍ حيّ ولا يحجبه — و«لاحقاً» تُغلقه بلا إعادة تركيب', (tester) async {
      await tester.pumpWidget(_gate(await _repo(_Server(_optional('1.2.0')))));
      await tester.pumpAndSettle();

      expect(find.byType(OptionalUpdatePrompt), findsOneWidget);
      expect(find.text(_promptTitle), findsOneWidget);
      expect(find.text('محتوى التطبيق'), findsOneWidget);
      expect(find.byType(ForceUpdateScreen), findsNothing);
      expect(find.textContaining('1.2.0'), findsOneWidget);

      await tester.tap(find.byKey(const Key('optional_update_later')));
      await tester.pumpAndSettle();
      expect(find.byType(OptionalUpdatePrompt), findsNothing);
      expect(find.text('محتوى التطبيق'), findsOneWidget);
      expect(_App.mounts, 1, reason: 'ظهور التنبيه واختفاؤه لا يعيد بناء التطبيق من الصفر');
    });

    testWidgets('مرّةً لكل إصدار: المُغلق لا يعود بعد إعادة التشغيل، والأحدث منه يظهر', (tester) async {
      final server = _Server(_optional('1.2.0'));
      await tester.pumpWidget(_gate(await _repo(server)));
      await tester.pumpAndSettle();
      // خارج البطاقة (هي في وسط الطبقة): الضغط على الخلفية = «لاحقاً».
      await tester.tapAt(const Offset(4, 4));
      await tester.pumpAndSettle();
      expect(find.byType(OptionalUpdatePrompt), findsNothing);

      await tester.pumpWidget(_gate(await _repo(server), runId: 'restart'));
      await tester.pumpAndSettle();
      expect(find.byType(OptionalUpdatePrompt), findsNothing);

      server.body = _optional('1.3.0');
      await tester.pumpWidget(_gate(await _repo(server), runId: 'newer'));
      await tester.pumpAndSettle();
      expect(find.byType(OptionalUpdatePrompt), findsOneWidget);
    });

    testWidgets('[CRITICAL] الإجباري يبقى بلا «لاحقاً» — التنبيه لا يظهر فوق الحجب', (tester) async {
      await tester.pumpWidget(_gate(await _repo(_Server(_mandatory('1.1.0', '1.2.0')))));
      await tester.pumpAndSettle();
      expect(find.byType(ForceUpdateScreen), findsOneWidget);
      expect(find.byType(OptionalUpdatePrompt), findsNothing);
      expect(find.text(AppStrings.arabic('updateLater')), findsNothing);
      expect(find.text('محتوى التطبيق'), findsNothing);
    });

    /// قناة url_launcher كما على جهاز: [reply] تُرجع ما يردّه النظام أو ترمي.
    void launcher(WidgetTester tester, Future<Object?> Function(MethodCall call) reply, List<MethodCall> calls) {
      const channel = MethodChannel('plugins.flutter.io/url_launcher');
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, (call) {
        calls.add(call);
        return reply(call);
      });
      addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(channel, null));
    }

    testWidgets('«تحديث التطبيق» يفتح صفحة تطبيقنا خارج التطبيق — بضغطة الزبون وحدها', (tester) async {
      final calls = <MethodCall>[];
      launcher(tester, (_) async => true, calls);
      await tester.pumpWidget(_gate(await _repo(_Server(_optional('1.2.0')))));
      await tester.pumpAndSettle();
      expect(calls, isEmpty, reason: 'لا فتح تلقائي للمتجر');
      await tester.tap(find.byKey(const Key('optional_update_button')));
      await tester.pumpAndSettle();
      expect(calls.single.arguments, containsPair('url', _play));
      expect(find.byType(OptionalUpdatePrompt), findsNothing);
    });

    testWidgets('تعذّر فتح المتجر (رفضٌ أو لا تطبيق يستقبله): تنبيهٌ ظاهر لا فشلٌ صامت', (tester) async {
      for (final failure in <Future<Object?> Function(MethodCall)>[
        (_) async => false,
        (_) async => throw PlatformException(code: 'ACTIVITY_NOT_FOUND'),
      ]) {
        SharedPreferences.setMockInitialValues({});
        launcher(tester, failure, <MethodCall>[]);
        await tester.pumpWidget(_gate(await _repo(_Server(_optional('1.2.0'))), runId: '$failure'));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const Key('optional_update_button')));
        await tester.pumpAndSettle();
        expect(find.text(AppStrings.arabic('storeOpenFailed')), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pump(const Duration(seconds: 5));
        await tester.pumpAndSettle();
      }
    });

    testWidgets('[SECURITY] رابطٌ غير موثوق: «رابط التحديث غير متوفر» ولا يُفتح شيء', (tester) async {
      await tester.pumpWidget(
        _gate(await _repo(_Server({..._optional('1.2.0'), 'updateUrl': 'https://example.com/app.apk'}))),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const Key('optional_update_button')));
      await tester.pumpAndSettle();
      expect(find.text(AppStrings.arabic('updateLinkUnavailable')), findsOneWidget);
    });
  });

  group('الحاجز: إعادة المحاولة بلا شبكة', () {
    testWidgets('[CRITICAL] أوّل تشغيلٍ بلا شبكة لا يحجب، ثم يُعاد الفحص بعد ١٥ ثانية فيحجب ما نُشر', (tester) async {
      final server = _Server(_mandatory('1.1.0', '1.1.0'))..down = true;
      await tester.pumpWidget(_gate(await _repo(server)));
      await tester.pumpAndSettle();
      expect(find.text('محتوى التطبيق'), findsOneWidget);
      final afterBoot = server.calls;

      server.down = false;
      await tester.pump(ForceUpdateGate.retryDelays.first - const Duration(seconds: 1));
      expect(server.calls, afterBoot, reason: 'لا محاولة قبل المهلة');
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(server.calls, afterBoot + 1);
      expect(find.byType(ForceUpdateScreen), findsOneWidget);
    });

    testWidgets('المهل تتزايد، وتتوقّف بعد أوّل نجاح', (tester) async {
      final server = _Server(_optional('1.0.0'))..down = true;
      await tester.pumpWidget(_gate(await _repo(server)));
      await tester.pumpAndSettle();
      final start = server.calls;

      await tester.pump(ForceUpdateGate.retryDelays[0]);
      await tester.pumpAndSettle();
      expect(server.calls, start + 1);
      await tester.pump(ForceUpdateGate.retryDelays[0]);
      await tester.pumpAndSettle();
      expect(server.calls, start + 1, reason: 'الثانية بعد ٣٠ ثانية لا ١٥');
      await tester.pump(ForceUpdateGate.retryDelays[1] - ForceUpdateGate.retryDelays[0]);
      await tester.pumpAndSettle();
      expect(server.calls, start + 2);

      server.down = false;
      await tester.pump(ForceUpdateGate.retryDelays[2]);
      await tester.pumpAndSettle();
      expect(server.calls, start + 3);
      await tester.pump(const Duration(minutes: 10));
      await tester.pumpAndSettle();
      expect(server.calls, start + 3, reason: 'لا محاولات بعد النجاح');
    });

    testWidgets('[CRITICAL] حجبٌ معروف لا يفكّه فشل الشبكة ولا إعادة المحاولة', (tester) async {
      final server = _Server(_mandatory('1.1.0', '1.1.0'));
      await tester.pumpWidget(_gate(await _repo(server)));
      await tester.pumpAndSettle();
      expect(find.byType(ForceUpdateScreen), findsOneWidget);

      server.down = true;
      await tester.pumpWidget(_gate(await _repo(server), runId: 'offline-restart'));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(minutes: 3));
      await tester.pumpAndSettle();
      expect(find.byType(ForceUpdateScreen), findsOneWidget);
      expect(find.text('محتوى التطبيق'), findsNothing);
    });
  });
}
