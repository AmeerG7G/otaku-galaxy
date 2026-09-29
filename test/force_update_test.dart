// إجبار التحديث — المقارنة، الحكم، الحاجز.
//
// الضمانة الجوهرية مزدوجة: **يُحجب من يجب حجبه** (نسخة دون الحدّ، ولو أعاد
// التشغيل أو أطفأ الشبكة)، و**لا يُحجب من لا يجب** (شبكة معطّلة، خادم
// ساقط، إعداد غير مضبوط، نسخة غير مقروءة). الخطأ في الاتجاه الثاني أفدح:
// يُقفل التطبيق على كل مستخدميه دفعةً واحدة.

import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/network/api_client.dart';
import 'package:otaku_galaxy/features/app_update/data/app_version_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/app_update/data/installed_version.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version_config.dart';
import 'package:otaku_galaxy/features/app_update/presentation/screens/force_update_screen.dart';

/// خادم `/catalog/app-version` بردٍّ يضبطه الاختبار، أو ساقط.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.body);
  _Adapter.down() : body = const {}, down = true;

  Map<String, Object?> body;
  bool down = false;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    if (down) {
      throw DioException.connectionError(
        requestOptions: options,
        reason: 'down',
      );
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

void main() {
  group('مقارنة النسخ الدلالية', () {
    test('[CRITICAL] 1.10.0 أحدث من 1.9.0 — لا مقارنة نصّية', () {
      // نصّياً `'1.10.0'.compareTo('1.9.0')` سالب لأن `'1' < '9'`. هذا الخطأ
      // بعينه يحجب مستخدماً على أحدث نسخة، أو يمرّر نسخةً ميّتة.
      expect('1.10.0'.compareTo('1.9.0'), lessThan(0), reason: 'خطأ النصّ');
      expect(compareVersionStrings('1.10.0', '1.9.0'), 1);
      expect(isUpdateRequired(installed: '1.10.0', minimum: '1.9.0'), isFalse);
      expect(isUpdateRequired(installed: '1.9.0', minimum: '1.10.0'), isTrue);
    });

    test('الترتيب التصاعدي يمرّ على الأجزاء الثلاثة', () {
      const ascending = [
        '1.0.0',
        '1.0.1',
        '1.1.0',
        '1.9.0',
        '1.9.9',
        '1.10.0',
        '2.0.0',
      ];
      for (var i = 1; i < ascending.length; i += 1) {
        expect(
          compareVersionStrings(ascending[i - 1], ascending[i]),
          -1,
          reason: '${ascending[i - 1]} يجب أن تكون أقدم من ${ascending[i]}',
        );
      }
    });

    test('المثبَّتة أقل من الحدّ ← تحديث إجباري', () {
      expect(isUpdateRequired(installed: '1.1.0', minimum: '1.2.0'), isTrue);
    });

    test('المثبَّتة تساوي الحدّ ← مسموح', () {
      expect(isUpdateRequired(installed: '1.2.0', minimum: '1.2.0'), isFalse);
    });

    test('المثبَّتة أعلى من الحدّ ← مسموح', () {
      expect(isUpdateRequired(installed: '1.3.0', minimum: '1.2.0'), isFalse);
      expect(isUpdateRequired(installed: '2.0.0', minimum: '1.99.99'), isFalse);
    });

    test('ما قبل الإصدار أدنى من نظيره المستقرّ', () {
      expect(compareVersionStrings('1.2.0-beta', '1.2.0'), -1);
      expect(compareVersionStrings('1.2.0-beta.2', '1.2.0-beta.10'), -1);
      expect(compareVersionStrings('1.2.0-1', '1.2.0-alpha'), -1);
    });

    test('رقم البناء لا يدخل في الأسبقية (`1.0.0+1` في pubspec)', () {
      expect(compareVersionStrings('1.0.0+1', '1.0.0+99'), 0);
      expect(isUpdateRequired(installed: '1.0.0+1', minimum: '1.0.0'), isFalse);
    });

    test('[CRITICAL] المدخل الفاسد لا يُقرأ كـ«محجوب»', () {
      // الحجب يُقفل التطبيق؛ فلا يُتّخذ على قيمةٍ لم تُفهم أصلاً.
      for (final bad in ['', 'v1.2.3', '1.2', '1.2.3.4', 'abc', null]) {
        expect(AppVersion.tryParse(bad), isNull, reason: 'المدخل: $bad');
        expect(isUpdateRequired(installed: bad, minimum: '9.9.9'), isFalse);
      }
      expect(isUpdateRequired(installed: '1.0.0', minimum: ''), isFalse);
      expect(isUpdateRequired(installed: '1.0.0', minimum: null), isFalse);
    });
  });

  group('النسخة المثبَّتة', () {
    test('[CRITICAL] لاحقة النكهة تُزال — وإلا حُجب كل بناء تطوير', () {
      // `versionNameSuffix = "-dev"` في build.gradle.kts يجعل النسخة
      // `1.0.0-dev`، وهي بقواعد SemVer **أدنى** من `1.0.0`.
      expect(normalizeInstalledVersion('1.0.0-dev'), '1.0.0');
      expect(normalizeInstalledVersion('1.4.2-staging'), '1.4.2');
      expect(
        isUpdateRequired(
          installed: normalizeInstalledVersion('1.0.0-dev'),
          minimum: '1.0.0',
        ),
        isFalse,
      );
      // ولو تُركت كما هي لحُجبت — وهذا ما يبرّر التطبيع.
      expect(isUpdateRequired(installed: '1.0.0-dev', minimum: '1.0.0'), isTrue);
    });

    test('الإصدار التمهيدي الحقيقي يبقى كما هو', () {
      // `-beta.1` ليس لاحقة نكهة يضيفها Gradle، بل إصدار يديره الفريق.
      expect(normalizeInstalledVersion('1.5.0-beta.1'), '1.5.0-beta.1');
      expect(normalizeInstalledVersion('2.0.0'), '2.0.0');
    });
  });

  group('قراءة الإعداد (STEP 64 §16: تفعيل، حدّ أدنى، رابطٌ واحد)', () {
    const url = 'https://play.google.com/store/apps/details?id=x';

    test('الشكل الجديد: الحدّ الفعّال والرابط الواحد', () {
      final config = AppVersionConfig.fromJson(const {
        'forceUpdateEnabled': true,
        'minimumSupportedVersion': ' 1.2.0 ',
        'updateUrl': url,
      });
      expect(config.minimumSupportedVersion, '1.2.0');
      expect(config.updateUrl, url);
    });

    test(
      '[CRITICAL] `forceUpdateEnabled: false` صريحاً لا يحجب ولو بقي حدٌّ',
      () {
        final config = AppVersionConfig.fromJson(const {
          'forceUpdateEnabled': false,
          'minimumSupportedVersion': '9.9.9',
          'updateUrl': url,
        });
        expect(config.minimumSupportedVersion, '');
        expect(
          isUpdateRequired(
            installed: '1.0.0',
            minimum: config.minimumSupportedVersion,
          ),
          isFalse,
        );
      },
    );

    test(
      'ردٌّ قديم (خادمٌ قبل STEP 64 أو مخبّأ): الحدّ يُحترم ورابط المنصّة يُستعمل',
      () {
        const legacy = {
          'minimumSupportedVersion': '1.2.0',
          'latestVersion': '1.3.0',
          'androidStoreUrl': url,
          'iosStoreUrl': 'https://apps.apple.com/app/id1',
          'updateMessage': 'رسالة قديمة',
        };
        expect(AppVersionConfig.fromJson(legacy, isIos: false).updateUrl, url);
        expect(
          AppVersionConfig.fromJson(legacy, isIos: true).updateUrl,
          contains('apps.apple.com'),
        );
        expect(
          AppVersionConfig.fromJson(legacy).minimumSupportedVersion,
          '1.2.0',
        );
        // المضبوط وحده يُستعمل للمنصّتين — زرٌّ يفتح متجراً خيرٌ من زرٍّ ميت.
        expect(
          AppVersionConfig.fromJson(const {
            'androidStoreUrl': url,
          }, isIos: true).updateUrl,
          url,
        );
      },
    );

    test('بلا رابط ← نصّ فارغ لا رابط مختلَق', () {
      expect(
        AppVersionConfig.fromJson(const {
          'minimumSupportedVersion': '1.2.0',
        }).updateUrl,
        '',
      );
    });

    test('[CRITICAL] أنواعٌ فاسدة لا تحجب ولا ترمي', () {
      final config = AppVersionConfig.fromJson(const {
        'forceUpdateEnabled': 'yes',
        'minimumSupportedVersion': 120,
        'updateUrl': ['x'],
      });
      expect(config.minimumSupportedVersion, '');
      expect(config.updateUrl, '');
      for (final bad in ['1.2', 'v2', 'latest']) {
        final malformed = AppVersionConfig.fromJson({
          'minimumSupportedVersion': bad,
        });
        expect(
          isUpdateRequired(
            installed: '1.0.0',
            minimum: malformed.minimumSupportedVersion,
          ),
          isFalse,
          reason: bad,
        );
      }
    });

    test('المخبّأ يعود كما حُفظ', () {
      const config = AppVersionConfig(
        minimumSupportedVersion: '1.2.0',
        updateUrl: url,
      );
      final back = AppVersionConfig.fromJson(config.toJson());
      expect(back.minimumSupportedVersion, '1.2.0');
      expect(back.updateUrl, url);
    });
  });

  group('المستودع: الخادم الساقط لا يحجب، والحكم الأخير يصمد', () {
    setUp(() => SharedPreferences.setMockInitialValues({}));

    Future<AppVersionRepository> repo(
      _Adapter adapter, {
      String installed = '1.0.0',
    }) async => AppVersionRepository(
      ApiClient(
        dio: Dio(BaseOptions(baseUrl: 'https://test.local/api'))
          ..httpClientAdapter = adapter,
      ),
      StaticInstalledVersion(installed),
      await SharedPreferences.getInstance(),
    );

    test('[CRITICAL] لم يصل ردٌّ قطّ + الخادم ساقط ← لا حجب', () async {
      final check = await (await repo(_Adapter.down())).check();
      expect(check.updateRequired, isFalse);
    });

    test(
      'الإجبار مفعَّل والنسخة دون الحدّ ← حجب، ويصمد بعد سقوط الخادم',
      () async {
        final adapter = _Adapter({
          'forceUpdateEnabled': true,
          'minimumSupportedVersion': '1.2.0',
          'updateUrl': 'https://x.example/app',
        });
        final first = await (await repo(adapter)).check();
        expect(first.updateRequired, isTrue);
        expect(first.config.updateUrl, 'https://x.example/app');

        adapter.down = true;
        final offline = await (await repo(adapter)).check();
        expect(offline.updateRequired, isTrue, reason: 'آخر حكمٍ ناجح يصمد');
        expect(offline.config.updateUrl, 'https://x.example/app');
      },
    );

    test('المسؤول عطّل الإجبار ← الحجب يُرفع عند أوّل ردٍّ ناجح', () async {
      final adapter = _Adapter({
        'forceUpdateEnabled': true,
        'minimumSupportedVersion': '1.2.0',
        'updateUrl': 'https://x.example/app',
      });
      expect((await (await repo(adapter)).check()).updateRequired, isTrue);
      adapter.body = {
        'forceUpdateEnabled': false,
        'minimumSupportedVersion': '',
        'updateUrl': 'https://x.example/app',
      };
      expect((await (await repo(adapter)).check()).updateRequired, isFalse);
    });

    test('1.9.9 < 1.10.0 < 2.0.0 عبر المستودع', () async {
      final adapter = _Adapter({
        'minimumSupportedVersion': '1.10.0',
        'updateUrl': 'https://x.example/app',
      });
      expect(
        (await (await repo(
          adapter,
          installed: '1.9.9',
        )).check()).updateRequired,
        isTrue,
      );
      expect(
        (await (await repo(
          adapter,
          installed: '1.10.0',
        )).check()).updateRequired,
        isFalse,
      );
      expect(
        (await (await repo(
          adapter,
          installed: '2.0.0',
        )).check()).updateRequired,
        isFalse,
      );
    });
  });

  group('شاشة إجبار التحديث', () {
    const config = AppVersionConfig(
      minimumSupportedVersion: '1.2.0',
      updateUrl: 'https://play.google.com/store/apps/details?id=x',
    );
    final defaultMessage = AppStrings.arabic('updateRequiredMessage');

    Widget host({VoidCallback? onOpen, AppVersionConfig config = config}) =>
        MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('ar'),
          home: Directionality(
            textDirection: TextDirection.rtl,
            child: ForceUpdateScreen(
              config: config,
              installedVersion: '1.1.0',
              onOpenStore: (url) async => onOpen?.call(),
            ),
          ),
        );

    testWidgets('[CRITICAL] بلا «تخطّي» ولا «لاحقاً» ولا «متابعة»', (
      tester,
    ) async {
      // وجود أيٍّ منها يُلغي معنى الإجبار: الحجب وقع لأن النسخة لم تعد
      // تعمل مع الخادم، فـ«لاحقاً» تعني شاشةً مكسورة لا تجربةً مؤجَّلة.
      await tester.pumpWidget(host());
      await tester.pump();

      for (final bypass in ['تخطي', 'تخطّي', 'لاحقاً', 'لاحقا', 'متابعة', 'إلغاء']) {
        expect(find.text(bypass), findsNothing, reason: 'وُجد مخرج: $bypass');
      }
      expect(find.byKey(const Key('force_update_button')), findsOneWidget);
    });

    testWidgets('تعرض النصّ الافتراضي، والمثبَّتة والحدّ الأدنى', (
      tester,
    ) async {
      await tester.pumpWidget(host());
      await tester.pump();
      expect(find.text(defaultMessage), findsOneWidget);
      expect(find.textContaining('1.1.0'), findsOneWidget);
      expect(find.textContaining('1.2.0'), findsOneWidget);
    });

    testWidgets('الزرّ يفتح رابط التحديث', (tester) async {
      String? opened;
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light,
          home: ForceUpdateScreen(
            config: config,
            installedVersion: '1.1.0',
            onOpenStore: (url) async => opened = url,
          ),
        ),
      );
      await tester.pump();
      await tester.tap(find.byKey(const Key('force_update_button')));
      await tester.pump();
      expect(opened, config.updateUrl);
    });

    testWidgets(
      'بلا رابط: الحاجز باقٍ ويقول «الرابط غير متوفر» بدل زرٍّ صامت',
      (tester) async {
        await tester.pumpWidget(
          host(
            config: const AppVersionConfig(minimumSupportedVersion: '1.2.0'),
          ),
        );
        await tester.pump();
        await tester.tap(find.byKey(const Key('force_update_button')));
        await tester.pump();
        expect(
          find.text(AppStrings.arabic('updateLinkUnavailable')),
          findsOneWidget,
        );
        expect(find.byType(ForceUpdateScreen), findsOneWidget);
      },
    );

    testWidgets('[CRITICAL] زرّ الرجوع لا يُخرج من الحاجز', (tester) async {
      await tester.pumpWidget(host());
      await tester.pump();

      final blockers = tester
          .widgetList(find.byWidgetPredicate((w) => w is PopScope))
          .cast<PopScope<Object?>>()
          .where((p) => !p.canPop);
      expect(blockers, isNotEmpty, reason: 'لا حاجزَ يمنع الرجوع');
    });

    testWidgets('[CRITICAL] بلا رسم شخصية — نصٌّ وواجهة فقط', (tester) async {
      // قرار 2026-09-27: شاشة التحديث الإلزامي لا تعرض أي شخصية أنمي. الصورة
      // الوحيدة المسموحة شعار المتجر (`assets/branding/`).
      await tester.pumpWidget(host());
      await tester.pump();

      final assets = tester
          .widgetList<Image>(find.byType(Image))
          .map((image) => image.image)
          .whereType<AssetImage>()
          .map((image) => image.assetName)
          .toList();
      expect(assets.where((a) => a.startsWith('assets/art/')), isEmpty, reason: '$assets');
      expect(assets.every((a) => a.startsWith('assets/branding/')), isTrue, reason: '$assets');
      // ولا صورةٌ من الشبكة ولا رسمٌ مُدار.
      expect(
        tester.widgetList<Image>(find.byType(Image)).where((i) => i.image is NetworkImage),
        isEmpty,
      );
      expect(find.text(defaultMessage), findsOneWidget);
      expect(find.byKey(const Key('force_update_button')), findsOneWidget);
    });

    Widget kurdishHost(AppVersionConfig config) => MaterialApp(
      theme: AppTheme.light,
      home: LocaleScope(
        language: AppLanguage.kurdish,
        child: Directionality(
          textDirection: TextDirection.rtl,
          child: ForceUpdateScreen(
            config: config,
            installedVersion: '1.1.0',
            onOpenStore: (_) async {},
          ),
        ),
      ),
    );

    testWidgets('[CRITICAL] كردي: كلّ النصوص بالكردية — لا رسالة مسؤول عربية', (
      tester,
    ) async {
      await tester.pumpWidget(
        kurdishHost(const AppVersionConfig(minimumSupportedVersion: '1.2.0')),
      );
      await tester.pump();
      expect(
        find.text(AppStrings.kurdish('updateRequiredMessage')),
        findsOneWidget,
      );
      expect(
        find.text(AppStrings.kurdish('updateRequiredTitle')),
        findsOneWidget,
      );
      expect(find.text(AppStrings.kurdish('updateApp')), findsOneWidget);
      expect(find.text(defaultMessage), findsNothing);
    });

    testWidgets('تُبنى بلا تجاوز على الهاتف الصغير واللوح', (tester) async {
      for (final size in const [
        Size(320, 560),
        Size(412, 892),
        Size(834, 1112),
      ]) {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1.0;
        addTearDown(tester.view.reset);
        await tester.pumpWidget(host());
        await tester.pump();
        expect(tester.takeException(), isNull, reason: 'المقاس $size');
      }
    });
  });
}
