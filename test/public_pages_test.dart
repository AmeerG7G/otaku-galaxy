import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/public_pages.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/router/app_router.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/settings/presentation/screens/settings_screen.dart';

import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

/// STEP 78 — التطبيق يفتح صفحتي الموقع العامّتين: سياسة الخصوصية من شاشة
/// الدخول، وحذف الحساب من الإعدادات بعد تأكيدٍ يقول إن الحذف يتمّ هناك.
/// الرابطان هما المسجَّلان في Google Play Console — يُقارَنان حرفياً.
void main() {
  late List<Uri> opened;
  late Future<bool> Function(Uri) original;

  setUpAll(loadProjectFonts);

  setUp(() {
    opened = [];
    original = PublicPages.launcher;
    PublicPages.launcher = (uri) async {
      opened.add(uri);
      return true;
    };
  });
  tearDown(() => PublicPages.launcher = original);

  test('الرابطان كما في Google Play Console', () {
    expect(PublicPages.privacyPolicy, 'https://otakugalaxystore.com/privacy-policy');
    expect(PublicPages.deleteAccount, 'https://otakugalaxystore.com/delete-account');
  });

  for (final language in AppLanguage.values) {
    final s = AppStrings.of(language);

    testWidgets('[${language.code}] شاشة الدخول: رابط سياسة الخصوصية يفتح الصفحة بلا جلسة', (tester) async {
      useGeoView(tester, const GeoView(Size(412, 892), 1.0));
      await pumpFixtureAuth(tester, route: const LoginRoute(), language: language, textScale: 1.0);
      final link = find.text(s('privacyPolicy'));
      expect(link, findsOneWidget);
      // لا يحجب الدخول ولا التسجيل ولا نسيان كلمة المرور.
      expect(find.text(s('login')), findsWidgets);
      expect(find.text(s('noAccountRegister')), findsOneWidget);
      expect(find.text(s('forgotPassword')), findsOneWidget);

      await tester.ensureVisible(link);
      await tester.tap(link);
      await tester.pump();
      expect(opened, [Uri.parse(PublicPages.privacyPolicy)]);
    });

    for (final loggedIn in [true, false]) {
      testWidgets('[${language.code}] الإعدادات${loggedIn ? '' : ' (زائر)'}: «حذف الحساب» يؤكّد ثم يفتح صفحة الحذف', (tester) async {
        useGeoView(tester, const GeoView(Size(412, 892), 1.0));
        await pumpFixtureApp(tester, home: const SettingsScreen(), language: language, textScale: 1.0, loggedIn: loggedIn);
        final row = find.text(s('deleteAccount'));
        expect(row, findsOneWidget);

        // إلغاء: لا شيء يُفتح.
        await tester.ensureVisible(row.last);
        await tester.tap(row.last);
        await settleFixture(tester);
        // الرسالة تقول إن الحذف يتمّ على الموقع — قبل مغادرة التطبيق.
        expect(
          find.byWidgetPredicate((w) => w is BoundedText && w.data == s('deleteAccountOpensWebsite')),
          findsOneWidget,
        );
        await tester.tap(find.text(s('cancel')));
        await settleFixture(tester);
        expect(opened, isEmpty);

        // متابعة: تُفتح صفحة الموقع — ولا شيء يُحذف من التطبيق نفسه.
        await tester.tap(row.last);
        await settleFixture(tester);
        await tester.tap(find.text(s('deleteAccountContinue')));
        await settleFixture(tester);
        expect(opened, [Uri.parse(PublicPages.deleteAccount)]);
      });
    }
  }

  testWidgets('تعذّر فتح المتصفح: رسالة ظاهرة لا صمت', (tester) async {
    PublicPages.launcher = (_) async => false;
    useGeoView(tester, const GeoView(Size(412, 892), 1.0));
    await pumpFixtureAuth(tester, route: const LoginRoute(), language: AppLanguage.arabic, textScale: 1.0);
    final link = find.text(AppStrings.of(AppLanguage.arabic)('privacyPolicy'));
    await tester.ensureVisible(link);
    await tester.tap(link);
    await tester.pump();
    expect(find.text(AppStrings.of(AppLanguage.arabic)('linkOpenFailed')), findsOneWidget);
  });
}
