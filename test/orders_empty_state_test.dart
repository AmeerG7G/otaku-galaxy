// «طلباتي» بلا طلبات (STEP 64 §22): الشخصية ← العنوان ← الوصف ← الزرّ،
// كلّها على محور اللوحة، والشخصية أكبر بـ٣٠٪ (١٥٠ ← ١٩٥)، واللوحة بارتفاع
// محتواها بلا فراغٍ ميت — والتركيب يصمد على الهواتف القصيرة والخطّ المكبَّر
// (الرسم يصغر، والباقي يُمرَّر، ولا فيضان).

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/config/app_config.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/core/di/injection_container.dart';
import 'package:otaku_galaxy/core/l10n/app_strings.dart';
import 'package:otaku_galaxy/core/l10n/locale_scope.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/domain/repositories/order_repository.dart';
import 'package:otaku_galaxy/features/orders/domain/usecases/fetch_my_orders_usecase.dart';
import 'package:otaku_galaxy/features/orders/presentation/screens/orders_screen.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';
import 'package:otaku_galaxy/features/visuals/domain/visual_slot.dart';
import 'package:otaku_galaxy/features/visuals/presentation/character_artwork.dart';

import 'support/render_harness.dart';

class _NoOrders implements OrderRepository {
  @override
  Future<List<Order>> fetchMyOrders() async => const [];
  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('$invocation');
}

Future<void> _pump(
  WidgetTester tester, {
  required Size size,
  AppLanguage language = AppLanguage.arabic,
  double textScale = 1.0,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    RepositoryProvider<FetchMyOrdersUsecase>.value(
      value: FetchMyOrdersUsecase(_NoOrders()),
      child: MaterialApp(
        theme: AppTheme.light,
        locale: const Locale('ar'),
        supportedLocales: const [Locale('ar')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        builder: (context, child) => LocaleScope(
          language: language,
          child: MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: child ?? const SizedBox.shrink(),
          ),
        ),
        home: const OrdersScreen(),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

final _state = find.byType(AnimeEmptyState);

Rect _panel(WidgetTester tester) => tester.getRect(
  find
      .descendant(
        of: find.descendant(
          of: _state,
          matching: find.byType(SingleChildScrollView),
        ),
        matching: find.byType(Container),
      )
      .first,
);

Rect _art(WidgetTester tester) => tester.getRect(
  find.byWidgetPredicate(
    (w) => w is CharacterArtwork && w.slot == VisualSlots.emptyOrders,
  ),
);

void main() {
  setUpAll(() async {
    await loadProjectFonts();
    if (!sl.isRegistered<AppConfig>()) {
      sl.registerLazySingleton<AppConfig>(() => AppConfig.development);
    }
  });

  const phones = <String, Size>{
    '412×892': Size(412, 892),
    '375×812': Size(375, 812),
    '360×740': Size(360, 740),
  };

  for (final language in AppLanguage.values) {
    for (final phone in phones.entries) {
      testWidgets(
        '${language.name} ${phone.key}: character → title → body → button, all on the panel axis',
        (tester) async {
          await _pump(tester, size: phone.value, language: language);
          expect(tester.takeException(), isNull);
          final strings = AppStrings.of(language);

          final state = tester.widget<AnimeEmptyState>(_state);
          expect(state.centered, isTrue, reason: 'the Cart composition');
          expect(state.fitContent, isTrue);

          final panel = _panel(tester);
          final art = _art(tester);
          final title = tester.getRect(find.text(strings('noOrdersTitle')));
          final body = tester.getRect(find.text(strings('noOrdersBody')));
          final button = tester.getRect(
            find.descendant(
              of: _state,
              matching: find.byType(AnimePrimaryButton),
            ),
          );

          // الترتيب الذي أكّده المالك: الشخصية فوق النصّ فوق الزرّ.
          expect(art.bottom, lessThanOrEqualTo(title.top + 1));
          expect(title.bottom, lessThanOrEqualTo(body.top + 1));
          expect(body.bottom, lessThanOrEqualTo(button.top + 1));
          // كلّها موسَّطة أفقياً في اللوحة.
          for (final (name, rect) in [
            ('character', art),
            ('title', title),
            ('body', body),
            ('button', button),
          ]) {
            expect(
              rect.center.dx,
              closeTo(panel.center.dx, 1),
              reason: '$name is not centred',
            );
          }
          for (final key in ['noOrdersTitle', 'noOrdersBody']) {
            expect(
              tester.widget<Text>(find.text(strings(key))).textAlign,
              TextAlign.center,
            );
          }

          // أكبر بـ٣٠٪: ١٩٥ كاملةً ما دامت المساحة تتّسع.
          expect(OrdersScreen.emptyArtworkHeight, closeTo(195, 0.001));
          expect(art.height, closeTo(195, 0.01));

          // لا فراغ ميت: اللوحة تبدأ بالشخصية وتنتهي بالزرّ — الحشوة ٢٤
          // وحدّ اللوحة ١ لا غير.
          expect(art.top - panel.top, closeTo(24 + 1, 0.5));
          expect(panel.bottom - button.bottom, closeTo(24 + 1, 0.5));
        },
      );
    }
  }

  // [REGRESSION] اللوحة الثابتة (٣٨٠) كانت تقلّص الرسم (`Flexible`) فلا يكبر؛
  // والتثبيت بلا حدٍّ كان سيفيض على الهاتف القصير. هنا: يصغر ولا يفيض.
  for (final language in AppLanguage.values) {
    for (final (name, size, scale) in const [
      ('320×568 ×1.0', Size(320, 568), 1.0),
      ('320×568 ×1.3', Size(320, 568), 1.3),
      ('360×640 ×1.3', Size(360, 640), 1.3),
    ]) {
      testWidgets(
        '${language.name} $name: no overflow, the character shrinks but stays above the button',
        (tester) async {
          await _pump(tester, size: size, language: language, textScale: scale);
          expect(tester.takeException(), isNull);

          final art = _art(tester);
          final strings = AppStrings.of(language);
          final title = tester.getRect(find.text(strings('noOrdersTitle')));
          expect(art.height, lessThanOrEqualTo(195));
          expect(art.height, greaterThanOrEqualTo(110));
          expect(art.bottom, lessThanOrEqualTo(title.top + 1));
          expect(art.left, greaterThanOrEqualTo(0));
          expect(art.right, lessThanOrEqualTo(size.width));

          // الزرّ في متناول اليد: يُمرَّر إليه إن لم يظهر.
          final button = find.descendant(
            of: _state,
            matching: find.byType(AnimePrimaryButton),
          );
          await tester.ensureVisible(button);
          await tester.pump();
          expect(tester.getRect(button).bottom, lessThanOrEqualTo(size.height));
          expect(tester.takeException(), isNull);
        },
      );
    }
  }
}
