// إجبار التحديث — المقارنة، الحكم، الحاجز.
//
// الضمانة الجوهرية مزدوجة: **يُحجب من يجب حجبه** (نسخة دون الحدّ، ولو أعاد
// التشغيل أو أطفأ الشبكة)، و**لا يُحجب من لا يجب** (شبكة معطّلة، خادم
// ساقط، إعداد غير مضبوط، نسخة غير مقروءة). الخطأ في الاتجاه الثاني أفدح:
// يُقفل التطبيق على كل مستخدميه دفعةً واحدة.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/app_update/data/installed_version.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version.dart';
import 'package:otaku_galaxy/features/app_update/domain/app_version_config.dart';
import 'package:otaku_galaxy/features/app_update/presentation/screens/force_update_screen.dart';

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
      const ascending = ['1.0.0', '1.0.1', '1.1.0', '1.9.0', '1.10.0', '2.0.0'];
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

  group('اختيار رابط المتجر', () {
    const both = AppVersionConfig(
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=x',
      iosStoreUrl: 'https://apps.apple.com/app/id1',
    );

    test('كل منصّة ورابطها', () {
      expect(both.storeUrlFor(isIos: false), contains('play.google.com'));
      expect(both.storeUrlFor(isIos: true), contains('apps.apple.com'));
    });

    test('المضبوط وحده يُستعمل للمنصّتين', () {
      // زرُّ تحديثٍ يفتح متجراً غير مثالي خيرٌ من زرٍّ لا يفعل شيئاً في
      // شاشةٍ لا مخرج منها سواه.
      const androidOnly = AppVersionConfig(
        androidStoreUrl: 'https://play.google.com/store/apps/details?id=x',
      );
      expect(androidOnly.storeUrlFor(isIos: true), contains('play.google.com'));
    });

    test('بلا رابط ← نصّ فارغ لا رابط مختلَق', () {
      expect(const AppVersionConfig().storeUrlFor(isIos: false), '');
    });
  });

  group('شاشة إجبار التحديث', () {
    const config = AppVersionConfig(
      minimumSupportedVersion: '1.2.0',
      latestVersion: '1.3.0',
      androidStoreUrl: 'https://play.google.com/store/apps/details?id=x',
      updateMessage: 'حدّث التطبيق للمتابعة',
    );

    Widget host({VoidCallback? onOpen}) => MaterialApp(
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

    testWidgets('تعرض الرسالة والنسختين', (tester) async {
      await tester.pumpWidget(host());
      await tester.pump();
      expect(find.text('حدّث التطبيق للمتابعة'), findsOneWidget);
      expect(find.textContaining('1.1.0'), findsOneWidget);
      expect(find.textContaining('1.3.0'), findsOneWidget);
    });

    testWidgets('الزرّ يفتح رابط المتجر', (tester) async {
      var opened = false;
      await tester.pumpWidget(host(onOpen: () => opened = true));
      await tester.pump();
      await tester.tap(find.byKey(const Key('force_update_button')));
      await tester.pump();
      expect(opened, isTrue);
    });

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
      expect(find.text('حدّث التطبيق للمتابعة'), findsOneWidget);
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

    testWidgets('[CRITICAL] كردي: رسالة المسؤول الكردية — لا رسالته العربية', (tester) async {
      await tester.pumpWidget(kurdishHost(const AppVersionConfig(
        minimumSupportedVersion: '1.2.0',
        updateMessage: 'حدّث التطبيق للمتابعة',
        updateMessageCkb: 'تکایە ئەپەکە نوێ بکەرەوە',
      )));
      await tester.pump();
      expect(find.text('تکایە ئەپەکە نوێ بکەرەوە'), findsOneWidget);
      expect(find.text('حدّث التطبيق للمتابعة'), findsNothing);
      expect(find.text(AppStrings.kurdish('updateRequiredTitle')), findsOneWidget);
      expect(find.text(AppStrings.kurdish('updateApp')), findsOneWidget);
    });

    testWidgets('كردي بلا رسالة كردية: النصّ الكردي الافتراضي — لا العربية', (tester) async {
      await tester.pumpWidget(kurdishHost(const AppVersionConfig(
        minimumSupportedVersion: '1.2.0',
        updateMessage: 'حدّث التطبيق للمتابعة',
      )));
      await tester.pump();
      expect(find.text(AppStrings.kurdish('updateRequiredMessage')), findsOneWidget);
      expect(find.text('حدّث التطبيق للمتابعة'), findsNothing);
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
