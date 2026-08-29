import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../orders/presentation/widgets/delivery_confirmation_sheet.dart';
import '../../../orders/domain/repositories/order_repository.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../account/presentation/screens/account_screen.dart';
import '../../../cart/presentation/screens/cart_screen.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../cart/presentation/cubit/cart_state.dart';
import '../../../categories/presentation/screens/categories_screen.dart';
import '../../../community/presentation/screens/community_screen.dart';
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

/// فهارس تبويبات التنقل الرئيسي — تُستخدم بدل الأرقام المباشرة حتى لا
/// تنكسر الانتقالات عند تغيير ترتيب التبويبات.
abstract final class MainTab {
  static const home = 0;
  static const categories = 1;
  static const community = 2;
  static const cart = 3;
  static const account = 4;

  /// عدد التبويبات — يحرس ضد فهرس خارج المدى.
  static const count = 5;
}

class _MainNavigationScreenState extends State<MainNavigationScreen>
    with WidgetsBindingObserver {
  int _index = 0;

  /// يمنع فتح ورقتين فوق بعضهما إذا عاد التطبيق للمقدّمة أثناء عرض واحدة،
  /// أو إذا وصل إشعار بينما الورقة مفتوحة أصلاً.
  bool _askingConfirmation = false;

  /// طلبات أجاب عنها العميل بـ«لم أستلمه بعد» في هذه الجلسة — لا نعيد
  /// سؤاله عنها فوراً في نفس الجلسة. الرفض لا يُخزَّن على الخادم عمداً:
  /// الطلب ما زال قيد التوصيل فعلاً، والسؤال يعود في الجلسة القادمة.
  final Set<String> _deferred = {};

  // RTL: الصفحة الرئيسية في أقصى اليمين => الفهرس 0 هو الرئيسية.
  // المجتمع في وسط الشريط كوجهة تصفّح بصرية مرفوعة.
  // المفضلة ليست تبويباً — تُفتح كصفحة من الحساب.
  static const _screens = [
    HomeScreen(),
    CategoriesScreen(),
    CommunityScreen(),
    CartScreen(),
    AccountScreen(),
  ];

  @override
  void initState() {
    super.initState();
    mainNavIndex.addListener(_onExternalIndexChanged);
    WidgetsBinding.instance.addObserver(this);
    // بعد أول إطار، حتى يكون هناك سياق صالح لعرض ورقة.
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => _checkPendingConfirmation(),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    mainNavIndex.removeListener(_onExternalIndexChanged);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // «فتح التطبيق» يشمل العودة إليه من الخلفية، لا الإقلاع البارد فقط.
    if (state == AppLifecycleState.resumed) _checkPendingConfirmation();
  }

  /// يسأل الخادم إن كان هناك طلب ينتظر تأكيد استلام، ويعرض الورقة.
  ///
  /// الحالة كلها من الخادم: طلب في `OUT_FOR_DELIVERY` يعني سؤالاً معلّقاً،
  /// وتأكيد الاستلام ينقله إلى `COMPLETED` فلا يعود المسار يُرجعه. لا شيء
  /// يُخزَّن محلياً ليقرّر الظهور.
  Future<void> _checkPendingConfirmation() async {
    if (_askingConfirmation || !mounted) return;
    if (!context.read<AuthCubit>().isLoggedIn) return;

    _askingConfirmation = true;
    try {
      final order = await sl<OrderRepository>().fetchPendingConfirmation();
      if (order == null || !mounted) return;
      if (_deferred.contains(order.id)) return;

      final choice = await showDeliveryConfirmationSheet(context, order: order);
      if (choice == null || !mounted) return;

      if (choice == DeliveryConfirmationChoice.notYet) {
        _deferred.add(order.id);
        return;
      }

      // التأكيد نفسه يجري في شاشة تفاصيل الطلب، فيبقى منح النقاط وطلب
      // الميلاد والانتقال للتقييم في مسار واحد بدل نسختين.
      await context.router.push(
        OrderDetailRoute(orderId: order.id, confirmOnOpen: true),
      );
    } catch (_) {
      // تعذّر السؤال لا يجب أن يُعطّل الشاشة الرئيسية؛ نُعيد المحاولة عند
      // العودة للتطبيق.
    } finally {
      _askingConfirmation = false;
    }
  }

  void _onExternalIndexChanged() {
    // حراسة ضد فهرس قديم خارج المدى (يرمي IndexedStack خلاف ذلك).
    final target = mainNavIndex.value.clamp(0, MainTab.count - 1);
    if (target != mainNavIndex.value) mainNavIndex.value = target;
    if (target == _index) return;
    setState(() => _index = target);
  }

  @override
  Widget build(BuildContext context) {
    // الشريط عائم فوق المحتوى، فنمدّ المحتوى خلفه بدل قصّه.
    return Scaffold(
      extendBody: true,
      body: IndexedStack(index: _index, children: _screens),
      bottomNavigationBar: BlocBuilder<CartCubit, CartState>(
        builder: (context, cart) => OtakuBottomNav(
          currentIndex: _index,
          raisedIndex: MainTab.community,
          onSelected: (index) {
            setState(() => _index = index);
            mainNavIndex.value = index;
          },
          items: [
            const OtakuNavItem(
              icon: Icons.home_outlined,
              activeIcon: Icons.home_rounded,
              label: 'الرئيسية',
            ),
            const OtakuNavItem(
              icon: Icons.grid_view_outlined,
              activeIcon: Icons.grid_view_rounded,
              label: 'الأقسام',
            ),
            const OtakuNavItem(
              icon: Icons.photo_library_outlined,
              activeIcon: Icons.photo_library_rounded,
              label: 'المجتمع',
            ),
            OtakuNavItem(
              icon: Icons.shopping_bag_outlined,
              activeIcon: Icons.shopping_bag_rounded,
              label: 'السلة',
              badgeCount: cart.count,
            ),
            const OtakuNavItem(
              icon: Icons.person_outline,
              activeIcon: Icons.person_rounded,
              label: 'الحساب',
            ),
          ],
        ),
      ),
    );
  }
}
