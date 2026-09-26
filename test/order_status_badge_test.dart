// هوية حالة الطلب مستقلّة عن لغة العرض.
//
// [CRITICAL] كانت `AnimeOrderStatusBadge` تُبدّل على النصّ العربي المعروض
// (`case 'قيد التوصيل':`)، أي أن **الترجمة** هي مُعرِّف الحالة. في واجهةٍ
// كردية لا يُطابق أيُّ فرع، فتسقط كلُّ الطلبات إلى الفرع الافتراضي: رمادي
// و`help_outline` وحالةٌ بلا معنى — بلا استثناء ولا تحذير. هذا الملفّ يثبت
// أن الشكل (أيقونة/تدرّج/توهّج) لا يتغيّر بتغيّر اللغة، وأن النصّ وحده
// يتغيّر.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:otaku_galaxy/core/design_system/components/feedback/anime_order_status_badge.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/orders/presentation/widgets/order_status_utils.dart';
import 'package:otaku_galaxy/features/settings/presentation/cubit/locale_cubit.dart';

Future<void> _pumpBadge(
  WidgetTester tester,
  OrderStatus status,
  AppLanguage language,
) async {
  SharedPreferences.setMockInitialValues(<String, Object>{});
  final prefs = await SharedPreferences.getInstance();
  final locale = LocaleCubit(prefs);
  await locale.setLanguage(language);

  await tester.pumpWidget(
    BlocProvider<LocaleCubit>.value(
      value: locale,
      child: MaterialApp(
        locale: language.locale,
        // نفس تجهيز `app.dart` حرفياً: بلا المندوبين تُحذّر Flutter من أن
        // `ar` غير مدعومة، والتحذير يصل كاستثناء فيُسقط الاختبار لسببٍ
        // لا علاقة له بما يقيسه.
        supportedLocales: AppLanguage.values.map((l) => l.locale),
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        localeResolutionCallback: (_, _) => const Locale('ar'),
        home: Scaffold(
          body: Center(child: AnimeOrderStatusBadge(status: status)),
        ),
      ),
    ),
  );
  await tester.pump();
}

/// البصمة البصرية للشارة — كلّ ما يميّز حالةً عن أخرى بلا نصّ.
({IconData icon, List<Color> colors, Color glow}) _visualOf(
  WidgetTester tester,
) {
  final icon = tester.widget<Icon>(find.byType(Icon));
  final container = tester.widget<Container>(
    find
        .ancestor(of: find.byType(Row), matching: find.byType(Container))
        .first,
  );
  final decoration = container.decoration! as BoxDecoration;
  final gradient = decoration.gradient! as LinearGradient;
  final shadow = decoration.boxShadow!.first;
  return (icon: icon.icon!, colors: gradient.colors, glow: shadow.color);
}

void main() {
  group('[CRITICAL] الحالة هويةٌ لا نصّ', () {
    testWidgets('الشكل نفسه في العربية والكردية لكل حالة', (tester) async {
      for (final status in OrderStatus.values) {
        await _pumpBadge(tester, status, AppLanguage.arabic);
        final arabic = _visualOf(tester);

        await _pumpBadge(tester, status, AppLanguage.kurdish);
        final kurdish = _visualOf(tester);

        expect(
          kurdish.icon,
          arabic.icon,
          reason: '$status: تغيّرت الأيقونة بتغيّر اللغة',
        );
        expect(
          kurdish.colors,
          arabic.colors,
          reason: '$status: تغيّر التدرّج بتغيّر اللغة',
        );
        expect(
          kurdish.glow,
          arabic.glow,
          reason: '$status: تغيّر التوهّج بتغيّر اللغة',
        );
      }
    });

    testWidgets('لا حالة تسقط إلى شكلٍ مجهول', (tester) async {
      // العطب القديم بعينه: `help_outline` رماديةً كان مصير كلِّ حالة في
      // واجهةٍ غير عربية. لا يجوز أن تحملها أيُّ حالة، بأيّ لغة.
      for (final language in AppLanguage.values) {
        for (final status in OrderStatus.values) {
          await _pumpBadge(tester, status, language);
          expect(
            _visualOf(tester).icon,
            isNot(Icons.help_outline),
            reason: '$status (${language.code}) سقطت إلى الشكل المجهول',
          );
        }
      }
    });

    testWidgets('كل حالة تحمل شكلاً مميّزاً عن الحالات المجاورة', (
      tester,
    ) async {
      // شارةٌ لا تميّز حالتين ليست شارة. تُقاس بالأيقونة: التدرّجات قد
      // تتشارك لوناً (مكتمل/تم التأكيد كلاهما `success`) عمداً.
      final icons = <IconData>{};
      for (final status in OrderStatus.values) {
        await _pumpBadge(tester, status, AppLanguage.arabic);
        final icon = _visualOf(tester).icon;
        expect(
          icons.add(icon),
          isTrue,
          reason: '$status تكرّر أيقونة حالةٍ أخرى',
        );
      }
      expect(icons.length, OrderStatus.values.length);
    });

    testWidgets('النصّ يأتي من طبقة الترجمة لا من الشارة', (tester) async {
      // الشارة كانت تحمل نسخةً ثانية مختصرة («تم التأكيد» بدل
      // «قيد التجهيز»)، فتفترق عن بقيّة الشاشات عند أوّل تعديل صياغة.
      for (final status in OrderStatus.values) {
        await _pumpBadge(tester, status, AppLanguage.arabic);
        final context = tester.element(find.byType(AnimeOrderStatusBadge));
        expect(
          find.text(orderStatusLabel(context, status)),
          findsOneWidget,
          reason: '$status: نصّ الشارة لا يطابق المصدر الوحيد',
        );
      }
    });

    testWidgets('تبديل اللغة ذهاباً وإياباً لا يغيّر الشكل', (tester) async {
      for (final status in OrderStatus.values) {
        await _pumpBadge(tester, status, AppLanguage.arabic);
        final before = _visualOf(tester);
        await _pumpBadge(tester, status, AppLanguage.kurdish);
        await _pumpBadge(tester, status, AppLanguage.arabic);
        final after = _visualOf(tester);
        expect(after.icon, before.icon, reason: '$status: تغيّر بعد التبديل');
        expect(after.colors, before.colors);
      }
    });
  });

  group('[CRITICAL] لغة مجهولة أو فارغة لا تكسر الحالة', () {
    testWidgets('AppLanguage.fromCode يرتدّ إلى العربية بلا رمي', (
      tester,
    ) async {
      for (final code in <String?>[null, '', 'en', 'ku', 'zz', '  ']) {
        expect(AppLanguage.fromCode(code), AppLanguage.arabic);
      }
    });

    testWidgets('الشارة تُبنى بلا LocaleCubit في الشجرة', (tester) async {
      // شجرةٌ معزولة (حوار بمُنقِّله الخاص) — يجب أن ترسم بالعربية لا أن ترمي.
      await tester.pumpWidget(
        MaterialApp(
          supportedLocales: AppLanguage.values.map((l) => l.locale),
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          localeResolutionCallback: (_, _) => const Locale('ar'),
          home: const Scaffold(
            body: AnimeOrderStatusBadge(status: OrderStatus.delivering),
          ),
        ),
      );
      await tester.pump();
      expect(tester.takeException(), isNull);
      expect(_visualOf(tester).icon, Icons.local_shipping);
    });
  });
}
