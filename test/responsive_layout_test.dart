// الاستجابة: هاتف صغير · هاتف · لوح — بلا تجاوز تخطيط وبلا تمديد أعمى.
//
// [CRITICAL] الضمانة الأولى **سلبية**: كل ما دون [Breakpoints.medium] يبقى
// مطابقاً للمرجع بالبكسل. الاستجابة إضافةٌ للشاشات العريضة، لا إعادةَ ضبطٍ
// لتخطيط الهاتف الذي رُسم على `Otaku Galaxy v2.dc.html` بدقّة.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';

/// مقاسات مرجعية — بأسماء أجهزةٍ حقيقية لا أرقامٍ مجرّدة.
const _smallPhone = Size(320, 568); // iPhone SE
const _phone = Size(393, 852); // هاتف معتاد — مقاس المرجع
const _largePhone = Size(430, 932);
const _tabletPortrait = Size(834, 1112);
const _tabletLandscape = Size(1194, 834);

Future<void> _pump(
  WidgetTester tester,
  Widget child, {
  required Size size,
}) async {
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.light,
      locale: const Locale('ar'),
      home: Directionality(textDirection: TextDirection.rtl, child: child),
    ),
  );
  await tester.pump();
}

void main() {
  group('أعمدة شبكة المنتجات', () {
    // العرض المتاح = عرض الشاشة − حشوة أفقية ١٨ من الجهتين.
    double content(Size s) => s.width - kProductGridHorizontalPadding * 2;

    test('[CRITICAL] الهاتف يبقى عمودين بعرض بطاقة المرجع نفسه', () {
      // ١٧٢ هو عرض العمود الذي رُسمت عليه بطاقة المنتج في المرجع
      // (٣٩٣ − ٣٦ حشوة − ١٣ فجوة، ÷ ٢). أي انحراف هنا يعني أن الاستجابة
      // غيّرت تخطيط الهاتف، وهو ما لم يُطلب ولا يجوز.
      final available = content(_phone);
      expect(productGridColumns(available), 2);
      expect((available - kProductCardCrossSpacing) / 2, closeTo(172, 0.5));
    });

    test('الهاتف الصغير والكبير: عمودان', () {
      expect(productGridColumns(content(_smallPhone)), 2);
      expect(productGridColumns(content(_largePhone)), 2);
    });

    test('اللوح: ثلاثة إلى خمسة أعمدة حسب العرض', () {
      expect(productGridColumns(content(const Size(600, 900))), 3);
      expect(productGridColumns(content(_tabletPortrait)), 4);
      expect(productGridColumns(content(_tabletLandscape)), 5);
    });

    test('[CRITICAL] البطاقة لا تضيق دون حدّ القراءة ولا تتّسع بلا حدّ', () {
      // بطاقةٌ أضيق من ١٥٠ تكسر أسماء المنتجات والأسعار؛ وأوسع من ٢٣٠
      // تفكّك التسلسل البصري وتجعل الشبكة جرداً.
      for (var width = 300.0; width <= 1400; width += 7) {
        final columns = productGridColumns(width);
        final card =
            (width - kProductCardCrossSpacing * (columns - 1)) / columns;
        expect(columns, greaterThanOrEqualTo(2));
        expect(columns, lessThanOrEqualTo(kProductGridMaxColumns));
        if (columns > 2) {
          expect(
            card,
            greaterThanOrEqualTo(kProductCardMinWidth),
            reason: 'عرض $width بـ$columns أعمدة يعطي بطاقة $card',
          );
        }
        // ما دام سقف الأعمدة غير مُلامَس، لا تتجاوز البطاقة الحدّ الأعلى.
        if (width >= 2 * kProductCardMaxWidth &&
            columns < kProductGridMaxColumns) {
          expect(
            card,
            lessThanOrEqualTo(kProductCardMaxWidth + 1),
            reason: 'عرض $width بـ$columns أعمدة يعطي بطاقة $card',
          );
        }
      }
    });

    test('عند سقف الأعمدة تتّسع البطاقة — وهو حدّ إطار المحتوى لا الشبكة', () {
      // فوق ~١٢٠٠ متاحة يصير الخيار: عمودٌ سادس أو بطاقةٌ أوسع من الحدّ.
      // المختار الثاني لأن المواصفة تنصّ على ٣–٥ أعمدة. عملياً لا يُبلغ هذا
      // المدى أصلاً: `kGridMaxWidth` يحدّ المحتوى قبله (١١٠٠ − ٣٦ = ١٠٦٤).
      expect(productGridColumns(1400), kProductGridMaxColumns);
      const framed = kGridMaxWidth - kProductGridHorizontalPadding * 2;
      final columns = productGridColumns(framed);
      final card =
          (framed - kProductCardCrossSpacing * (columns - 1)) / columns;
      expect(card, lessThanOrEqualTo(kProductCardMaxWidth));
    });

    test('عدد الأعمدة يتبع العرض المتاح لا حجم الجهاز', () {
      // الشبكة قد تُعرض داخل إطارٍ محدود على لوح — عندها عمودان لا خمسة.
      expect(productGridColumns(340), 2);
    });
  });

  group('صنف الشاشة', () {
    testWidgets('[CRITICAL] الضلع القصير هو المقياس لا العرض الحالي', (
      tester,
    ) async {
      // هاتف كبير بالعرض الأفقي (٩٣٢ × ٤٣٠) يتجاوز حدّ اللوح بعرضه، فلو
      // قِيس بالعرض لعُومل معاملةَ لوح على ارتفاع ٤٣٠ بكسل.
      late ScreenClass landscapePhone;
      await _pump(
        tester,
        Builder(
          builder: (context) {
            landscapePhone = context.screenClass;
            return const SizedBox.shrink();
          },
        ),
        size: const Size(932, 430),
      );
      expect(landscapePhone.isPhone, isTrue);
      expect(landscapePhone.isTablet, isFalse);
    });

    testWidgets('اللوح يُعرف لوحاً في الوضعين', (tester) async {
      for (final size in [_tabletPortrait, _tabletLandscape]) {
        late ScreenClass screen;
        await _pump(
          tester,
          Builder(
            builder: (context) {
              screen = context.screenClass;
              return const SizedBox.shrink();
            },
          ),
          size: size,
        );
        expect(screen.isTablet, isTrue, reason: 'المقاس $size');
      }
    });
  });

  group('إطار المحتوى', () {
    testWidgets('[CRITICAL] على الهاتف لا أثر له البتّة', (tester) async {
      // لو قيّد الإطار عرض المحتوى على الهاتف لتغيّر كل تخطيط في التطبيق.
      await _pump(
        tester,
        const ResponsiveContentFrame(
          maxWidth: kFormMaxWidth,
          // بعرض لا نهائي: يقيسه الإطار وحده، فيظهر أثره إن وُجد.
          child: SizedBox(key: Key('inner'), width: double.infinity, height: 10),
        ),
        size: _phone,
      );
      expect(tester.getSize(find.byKey(const Key('inner'))).width, 393);
    });

    testWidgets('على اللوح يحدّ العرض ويوسّط', (tester) async {
      await _pump(
        tester,
        const ResponsiveContentFrame(
          maxWidth: kFormMaxWidth,
          child: SizedBox(key: Key('inner'), width: double.infinity, height: 10),
        ),
        size: _tabletPortrait,
      );
      final rect = tester.getRect(find.byKey(const Key('inner')));
      expect(rect.width, kFormMaxWidth);
      expect(rect.center.dx, closeTo(_tabletPortrait.width / 2, 0.5));
    });
  });

  group('شريط التنقّل السفلي', () {
    Widget nav(int index) => Scaffold(
      bottomNavigationBar: OtakuBottomNav(
        currentIndex: index,
        raisedIndex: 2,
        onSelected: (_) {},
        items: const [
          OtakuNavItem(
            icon: Icons.home_outlined,
            activeIcon: Icons.home_rounded,
            label: 'الرئيسية',
          ),
          OtakuNavItem(
            icon: Icons.grid_view_outlined,
            activeIcon: Icons.grid_view_rounded,
            label: 'الأقسام',
            gridIconCount: 4,
          ),
          OtakuNavItem(
            icon: Icons.photo_library_outlined,
            activeIcon: Icons.photo_library_rounded,
            label: 'المجتمع',
          ),
          OtakuNavItem(
            icon: Icons.shopping_bag_outlined,
            activeIcon: Icons.shopping_bag_rounded,
            label: 'السلة',
            badgeCount: 3,
          ),
          OtakuNavItem(
            icon: Icons.person_outline,
            activeIcon: Icons.person_rounded,
            label: 'الحساب',
          ),
        ],
      ),
    );

    testWidgets('[CRITICAL] الوجهات الخمس تبقى خمساً على كل عرض', (
      tester,
    ) async {
      // المعمارية المعلوماتية لا تتغيّر مع العرض — الاستجابة تخطيطٌ لا
      // إعادةُ تنظيمٍ للتطبيق.
      for (final size in [
        _smallPhone,
        _phone,
        _tabletPortrait,
        _tabletLandscape,
      ]) {
        await _pump(tester, nav(0), size: size);
        for (final label in ['الرئيسية', 'الأقسام', 'المجتمع', 'السلة', 'الحساب']) {
          expect(find.text(label), findsOneWidget, reason: '$label في $size');
        }
        expect(tester.takeException(), isNull, reason: 'المقاس $size');
      }
    });

    testWidgets('على الهاتف يملأ العرض كما في المرجع', (tester) async {
      await _pump(tester, nav(0), size: _phone);
      // ١٤ حشوة من الجهتين في المرجع.
      final bar = tester.getSize(
        find.descendant(
          of: find.byType(OtakuBottomNav),
          matching: find.byType(Container),
        ).first,
      );
      expect(bar.width, closeTo(_phone.width - 28, 1));
    });

    testWidgets('على اللوح لا يتمدّد بعرض الشاشة', (tester) async {
      await _pump(tester, nav(0), size: _tabletLandscape);
      final bar = tester.getRect(
        find.descendant(
          of: find.byType(OtakuBottomNav),
          matching: find.byType(Container),
        ).first,
      );
      expect(bar.width, lessThanOrEqualTo(kNavBarMaxWidth));
      expect(bar.center.dx, closeTo(_tabletLandscape.width / 2, 1));
    });
  });

  group('الورقة السفلية', () {
    testWidgets('على اللوح محدودة وموسَّطة، وعلى الهاتف بعرض الشاشة', (
      tester,
    ) async {
      Widget sheet() => const Align(
        alignment: Alignment.bottomCenter,
        child: OtakuSheet(title: 'اختيار', child: Text('محتوى')),
      );

      await _pump(tester, sheet(), size: _phone);
      expect(
        tester.getSize(find.byType(OtakuSheet)).width,
        _phone.width,
      );

      await _pump(tester, sheet(), size: _tabletLandscape);
      final rect = tester.getRect(
        find
            .descendant(
              of: find.byType(OtakuSheet),
              matching: find.byType(Container),
            )
            .first,
      );
      expect(rect.width, lessThanOrEqualTo(kSheetMaxWidth));
      expect(rect.center.dx, closeTo(_tabletLandscape.width / 2, 1));
    });

    testWidgets('[CRITICAL] الورقة بارتفاع محتواها لا بارتفاع الشاشة', (
      tester,
    ) async {
      // `Align` بلا معامل ارتفاع يتمدّد إلى أقصى المتاح، فتصير الورقة
      // طويلةً بفراغٍ فوق محتواها — عطبٌ يظهر على كل الأجهزة لا الألواح.
      await _pump(
        tester,
        const Align(
          alignment: Alignment.bottomCenter,
          child: OtakuSheet(title: 'اختيار', child: Text('محتوى')),
        ),
        size: _phone,
      );
      expect(
        tester.getSize(find.byType(OtakuSheet)).height,
        lessThan(_phone.height / 2),
      );
    });
  });

  group('مكوّنات نظام التصميم بلا تجاوز', () {
    final samples = <String, Widget>{
      'AnimePrimaryButton': const AnimePrimaryButton(
        label: 'إتمام الطلب الآن مع التوصيل',
        onPressed: null,
      ),
      'AnimeSecondaryButton': const AnimeSecondaryButton(
        label: 'متابعة التسوّق',
        onPressed: null,
      ),
      'AnimeOutlinedButton': const AnimeOutlinedButton(
        label: 'إلغاء الطلب',
        onPressed: null,
      ),
      'AnimeTextField': const AnimeTextField(
        label: 'رقم الهاتف',
        hint: '07XXXXXXXXX',
      ),
      'OtakuQuantityStepper': OtakuQuantityStepper(
        quantity: 2,
        onIncrease: () {},
        onDecrease: () {},
      ),
      'AnimeCategoryCard': const AnimeCategoryCard(
        category: Category(id: 'c1', name: 'مجسّمات وتماثيل الأنمي'),
      ),
      'AnimeEmptyState': const AnimeEmptyState(
        title: 'ما بيه شي هنا',
        subtitle: 'ابدأ التصفّح وأضف ما يعجبك.',
        actionLabel: 'تصفّح المنتجات',
      ),
    };

    for (final entry in samples.entries) {
      for (final size in const <String, Size>{
        'هاتف صغير': _smallPhone,
        'هاتف': _phone,
        'لوح': _tabletPortrait,
      }.entries) {
        testWidgets('${entry.key} — ${size.key}', (tester) async {
          await _pump(
            tester,
            Scaffold(
              body: SingleChildScrollView(
                padding: const EdgeInsets.all(18),
                child: entry.value,
              ),
            ),
            size: size.value,
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}
