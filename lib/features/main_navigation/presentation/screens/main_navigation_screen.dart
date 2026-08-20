import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../account/presentation/screens/account_screen.dart';
import '../../../cart/presentation/screens/cart_screen.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../cart/presentation/cubit/cart_state.dart';
import '../../../categories/presentation/screens/categories_screen.dart';
import '../../../favorites/presentation/screens/favorites_screen.dart';
import '../../../home/presentation/screens/home_screen.dart';

/// مؤشّر التبويب النشط في الغلاف الرئيسي — يُستخدم لتبديل التبويب
/// من شاشات أخرى (مثل: «الذهاب إلى السلة» بعد الإضافة، «تصفح المنتجات»
/// من حالة المفضلة الفارغة). لا تغيّر القيمة الافتراضية (الرئيسية = 0).
final ValueNotifier<int> mainNavIndex = ValueNotifier<int>(0);

/// الغلاف الرئيسي: يضم التبويبات الخمسة في IndexedStack يحافظ على الحالة.
@RoutePage()
class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _index = 0;

  // RTL: الصفحة الرئيسية في أقصى اليمين => الفهرس 0 هو الرئيسية.
  static const _screens = [
    HomeScreen(),
    CategoriesScreen(),
    FavoritesScreen(),
    CartScreen(),
    AccountScreen(),
  ];

  @override
  void initState() {
    super.initState();
    mainNavIndex.addListener(_onExternalIndexChanged);
  }

  @override
  void dispose() {
    mainNavIndex.removeListener(_onExternalIndexChanged);
    super.dispose();
  }

  void _onExternalIndexChanged() {
    final target = mainNavIndex.value;
    if (target == _index) return;
    setState(() => _index = target);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          border: Border(
            top: BorderSide(
              color: Theme.of(context).colorScheme.outlineVariant,
            ),
          ),
        ),
        child: BlocBuilder<CartCubit, CartState>(
          builder: (context, cart) => NavigationBar(
            selectedIndex: _index,
            onDestinationSelected: (index) {
              setState(() => _index = index);
              mainNavIndex.value = index;
            },
            destinations: [
              const NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'الرئيسية',
              ),
              const NavigationDestination(
                icon: Icon(Icons.grid_view_outlined),
                selectedIcon: Icon(Icons.grid_view_rounded),
                label: 'الأقسام',
              ),
              const NavigationDestination(
                icon: Icon(Icons.favorite_outline),
                selectedIcon: Icon(Icons.favorite),
                label: 'المفضلة',
              ),
              NavigationDestination(
                icon: _CartIcon(count: cart.count),
                selectedIcon: _CartIcon(count: cart.count, selected: true),
                label: 'السلة',
              ),
              const NavigationDestination(
                icon: Icon(Icons.person_outline),
                selectedIcon: Icon(Icons.person),
                label: 'الحساب',
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CartIcon extends StatelessWidget {
  const _CartIcon({required this.count, this.selected = false});

  final int count;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final icon = Icon(
      selected ? Icons.shopping_bag : Icons.shopping_bag_outlined,
    );
    if (count == 0) return icon;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        icon,
        PositionedDirectional(
          top: -8,
          end: -11,
          child: Container(
            constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
            padding: const EdgeInsets.symmetric(horizontal: 4),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: AppColors.secondary,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
              border: Border.all(
                color: Theme.of(context).colorScheme.surface,
                width: 1.5,
              ),
            ),
            child: Text(
              count > 9 ? '9+' : '$count',
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: Colors.white,
                fontSize: 9,
                height: 1,
                fontWeight: AppDimens.weightBold,
              ),
            ),
          ),
        ),
      ],
    );
  }
}
