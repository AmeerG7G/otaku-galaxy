// فحص سريع لمكوّنات نظام تصميم Otaku Galaxy v2: يتأكّد أن كل مكوّن يبني
// بلا أخطاء تخطيط في الوضعين الفاتح والداكن، وبمقاسي هاتف مرجعي وضيّق، بـRTL.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:otaku_galaxy/core/design_system/design_system.dart';
import 'package:otaku_galaxy/features/cart/domain/entities/cart_item.dart';
import 'package:otaku_galaxy/features/orders/domain/entities/order.dart';
import 'package:otaku_galaxy/features/products/domain/entities/category.dart';
import 'package:otaku_galaxy/features/products/domain/entities/product.dart';
import 'package:otaku_galaxy/features/settings/presentation/widgets/personalize_cards.dart';

/// أسوأ حالة عرض: اسم طويل + خصم حقيقي + ترويج توصيل + تقييم — كل الأسطر
/// الاختيارية ظاهرة معاً، وهي التركيبة التي كانت تتجاوز التخطيط سابقاً.
const _product = Product(
  id: 'p1',
  name: 'تيشيرت أنمي بتصميم حصري ومطبوع بجودة عالية جداً وخامة ممتازة',
  price: 25000,
  description: 'وصف',
  images: [],
  stock: 2,
  rating: 4.6,
  categoryName: 'ملابس',
  previousPrice: 40000,
  discountPercent: 38,
  hasDeliveryPromo: true,
);

final _order = Order(
  id: 'o1',
  number: '1',
  province: 'النجف',
  deliveryCost: 5000,
  fullAddress: 'حي السلام، شارع 20',
  phone: '07701234567',
  total: 30000,
  status: OrderStatus.delivering,
  items: const [CartItem(product: _product, quantity: 2)],
  createdAt: DateTime(2026, 8, 20),
);

Widget _host(Widget child, {bool dark = false}) => MaterialApp(
  theme: AppTheme.light,
  darkTheme: AppTheme.dark,
  themeMode: dark ? ThemeMode.dark : ThemeMode.light,
  locale: const Locale('ar'),
  localizationsDelegates: const [
    DefaultMaterialLocalizations.delegate,
    DefaultWidgetsLocalizations.delegate,
  ],
  home: Directionality(
    textDirection: TextDirection.rtl,
    child: Scaffold(body: child),
  ),
);

void main() {
  // مقاس الهاتف المرجعي في مصدر التصميم (412×892).
  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized();
  });

  final cases = <String, Widget>{
    'OtakuScreenHeader.plain': const OtakuScreenHeader(
      title: 'طلباتي',
      subtitle: 'تابع حالة كل طلب خطوة بخطوة',
      artwork: 'assets/art/opt/a-i4.png',
    ),
    'OtakuScreenHeader.tab': const OtakuScreenHeader.tab(
      title: 'الأقسام',
      subtitle: 'تصفّح كل ما في مجرة الأوتاكو',
    ),
    'OtakuScreenHeader.compact': const OtakuScreenHeader.compact(
      title: 'الإعدادات',
    ),
    'OtakuScreenHeader.gradient': OtakuScreenHeader.gradient(
      title: 'الإكسسوارات',
      subtitle: '12 منتج في هذا القسم',
      gradient: LinearGradient(colors: AnimeCategoryCard.gradientFor(0)),
    ),
    'OtakuPanel': const OtakuPanel(child: Text('سطح عائم')),
    'OtakuEditorialPanel': const OtakuEditorialPanel(
      title: 'لوحة تحريرية',
      body: 'نص وصفي قصير داخل اللوحة.',
      artwork: 'assets/art/opt/a-luffy-kid.png',
    ),
    'OtakuSectionTitle': const OtakuSectionTitle(title: 'قسم'),
    'OtakuGroupLabel': const OtakuGroupLabel(label: 'الحساب'),
    'OtakuSettingRow': OtakuSettingRow(
      label: 'الإعدادات',
      icon: Icons.settings_outlined,
      onTap: () {},
    ),
    'OtakuStatusPill': const OtakuStatusPill(
      label: 'قيد التوصيل',
      color: AppColors.accentCyan,
    ),
    'OtakuSortBar': OtakuSortBar(label: 'الأحدث', onTap: () {}),
    'OtakuSegmentedControl': OtakuSegmentedControl(
      labels: const ['المفضلة', 'مجموعاتي'],
      selectedIndex: 0,
      onSelected: (_) {},
    ),
    'OtakuSwitch': OtakuSwitch(value: true, onChanged: (_) {}),
    'OtakuQuantityStepper': OtakuQuantityStepper(
      quantity: 2,
      onIncrease: () {},
      onDecrease: () {},
    ),
    'OtakuSkeleton': const OtakuSkeleton(height: 12),
    'OtakuProductSkeletonGrid': const OtakuProductSkeletonGrid(count: 4),
    'OtakuListSkeleton': const OtakuListSkeleton(count: 2),
    'ProductStockPill': const ProductStockPill(stock: 2),
    'ProductPhotoSlot': const SizedBox(height: 130, child: ProductPhotoSlot()),
    // تُختبر داخل الشبكة الحقيقية المستخدمة في الشاشات (عمودان، نسبة 0.62).
    'AnimeProductCard': GridView.builder(
      padding: const EdgeInsets.fromLTRB(18, 10, 18, 26),
      gridDelegate: kProductGridDelegate,
      itemCount: 4,
      itemBuilder: (_, _) => const AnimeProductCard(product: _product),
    ),
    'AnimeProductRow': AnimeProductRow(product: _product, onTap: () {}),
    'AnimeCategoryCard': const AnimeCategoryCard(
      category: Category(id: 'c', name: 'إكسسوارات', subcategories: ['x']),
      index: 3,
    ),
    'AnimeCategoryCard.rail': const SizedBox(
      height: 100,
      child: AnimeCategoryCard.rail(
        category: Category(id: 'c', name: 'حقائب'),
        index: 2,
      ),
    ),
    'AnimeOrderCard': AnimeOrderCard(order: _order),
    'AnimeEmptyState': const AnimeEmptyState(
      title: 'لا توجد طلبات بعد',
      subtitle: 'كل طلب تكمله سيظهر هنا.',
      artwork: 'assets/art/opt/a-luffy-kid.png',
    ),
    'LanguageCard': LanguageCard(
      name: 'العربية',
      subtitle: 'اللغة الافتراضية',
      selected: true,
      onTap: () {},
    ),
    'ThemePreviewCard.light': ThemePreviewCard(
      dark: false,
      label: 'فاتح',
      selected: true,
      onTap: () {},
    ),
    'ThemePreviewCard.dark': ThemePreviewCard(
      dark: true,
      label: 'داكن',
      selected: false,
      onTap: () {},
    ),
    'OtakuBottomNav': OtakuBottomNav(
      currentIndex: 0,
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
  };

  // 412×892 = مقاس المرجع في مصدر التصميم، و375×812 = أضيق هاتف شائع.
  const sizes = <String, Size>{
    'ref': Size(412, 892),
    'narrow': Size(375, 812),
    // أصغر مقاس مدعوم — أكثر ما يكشف تجاوز التخطيط (overflow).
    'tiny': Size(320, 640),
  };

  for (final entry in cases.entries) {
    for (final dark in [false, true]) {
      for (final size in sizes.entries) {
        final mode = dark ? 'داكن' : 'فاتح';
        testWidgets('${entry.key} — $mode — ${size.key}', (tester) async {
          tester.view.physicalSize = size.value;
          tester.view.devicePixelRatio = 1.0;
          addTearDown(tester.view.reset);

          await tester.pumpWidget(_host(entry.value, dark: dark));
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
