// زرّ «تسوّق الآن» في بطاقة البطل ظاهرٌ كلّه فوق شريط التنقّل عند أول عرض.
//
// [CRITICAL] (2026-10-13) عند ٣٢٠×٥٦٨ × ١٫٣ نزل الزرّ تحت سطح الشريط العائم
// (٤ بكسل) وتحت زرّ المجتمع المرفوع (١٢): عمود نصّ البطل صار أضيق من ١٩٠
// فالتفّ العنوان سطراً رابعاً وطالت البطاقة ٣٩. العقد هنا: الزرّ بين شريط
// الحالة وسطح الشريط ناقصاً مسافة التصميم (`OtakuBottomNav.contentGap`)، لا
// يتقاطع مع أيّ عنصرٍ من الشريط، والنقر في وسطه يصله هو لا الشريط.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/features/home/presentation/widgets/home_compositions.dart';
import 'package:otaku_galaxy/features/main_navigation/presentation/screens/main_navigation_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

import 'support/render_harness.dart';
import 'support/screen_fixtures.dart';

Rect _rectOf(RenderBox box) => box.localToGlobal(Offset.zero) & box.size;

void main() {
  setUpAll(loadProjectFonts);

  for (final view in kGeoViews) {
    for (final language in AppLanguage.values) {
      testWidgets('$view ${language.code}', (tester) async {
        useGeoView(tester, view);
        await pumpFixtureShell(
          tester,
          tab: MainTab.home,
          language: language,
          textScale: view.textScale,
        );

        final label = find.descendant(
          of: find.byType(HomeHeroCard),
          matching: find.text(AppStrings.of(language)('shopNow')),
        );
        final button = find
            .ancestor(of: label, matching: find.byType(Container))
            .first;
        final ctaBox = tester.renderObject<RenderBox>(button);
        final cta = _rectOf(ctaBox);

        final nav = find.byType(OtakuBottomNav);
        final surface = tester.getRect(
          find
              .descendant(
                of: nav,
                matching: find.byWidgetPredicate(
                  (w) =>
                      w is Container &&
                      w.decoration is BoxDecoration &&
                      (w.decoration! as BoxDecoration).borderRadius ==
                          BorderRadius.circular(26),
                ),
              )
              .first,
        );
        // كل ما يرسمه الشريط — السطح، وزرّ المجتمع البارز فوقه.
        final navParts = [
          for (final e
              in find
                  .descendant(
                    of: nav,
                    matching: find.byWidgetPredicate((_) => true),
                  )
                  .evaluate())
            if (e.renderObject case final RenderBox box
                when box.hasSize && !box.size.isEmpty)
              _rectOf(box),
        ];

        expect(cta.top, greaterThanOrEqualTo(kStatusBar));
        expect(cta.left, greaterThanOrEqualTo(0));
        expect(cta.right, lessThanOrEqualTo(view.size.width));
        expect(
          cta.bottom,
          lessThanOrEqualTo(surface.top - OtakuBottomNav.contentGap + 0.01),
          reason: 'الزرّ $cta تحت الشريط (${surface.top})',
        );
        for (final part in navParts) {
          expect(cta.overlaps(part), isFalse, reason: 'الزرّ $cta ∩ $part');
        }
        // يُنقر: وسطه يصل إلى الزرّ نفسه لا إلى الشريط.
        final hits = tester
            .hitTestOnBinding(cta.center)
            .path
            .map((e) => e.target);
        expect(hits, contains(ctaBox));
      });
    }
  }
}
