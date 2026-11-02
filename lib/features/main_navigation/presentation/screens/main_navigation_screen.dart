import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/auth/require_auth.dart';
import '../../../reviews/presentation/cubit/reviews_cubit.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/gender.dart';
import '../../../orders/presentation/widgets/delivery_confirmation_sheet.dart';
import '../../../orders/domain/repositories/order_repository.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../../core/router/app_router.dart';
import '../../../../core/di/injection_container.dart';
import '../../../notifications/push/push_tap_router.dart';
import '../../../account/presentation/screens/account_screen.dart';
import '../../../cart/presentation/screens/cart_screen.dart';
import '../../../cart/presentation/cart_auto_sync.dart';
import '../../../cart/presentation/cubit/cart_cubit.dart';
import '../../../cart/presentation/cubit/cart_state.dart';
import '../../../categories/presentation/screens/categories_screen.dart';
import '../../../community/presentation/screens/community_screen.dart';
import '../../../home/presentation/screens/home_screen.dart';

/// مؤشّر التبويب النشط في الغلاف الرئيسي — يُستخدم لتبديل التبويب
/// من شاشات أخرى (مثل: «الذهاب إلى السلة» بعد الإضافة، «تصفح المنتجات»
/// من حالة المفضلة الفارغة). لا تغيّر القيمة الافتراضية (الرئيسية = 0).
final ValueNotifier<int> mainNavIndex = ValueNotifier<int>(0);

/// تبويب محمي طلبه زائر قبل تسجيل الدخول (السلة أو الحساب) — يُطبَّق
/// مرة واحدة بعد نجاح الدخول ليصل المستخدم إلى الوجهة التي أرادها أصلاً.
///
/// لا يُمسّ قبل الدخول حفاظاً على «مَن ألغى يبقى في حالته»: الزائر الذي
/// تراجع من شاشة الدخول يبقى في التبويب العام الذي كان فيه، ولو أراد لاحقاً
/// تسجيل الدخول من بوابة أخرى سيعيد ضبط هذه القيمة إعادةُ فتح البوابة.
int? pendingProtectedTab;

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
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkPendingConfirmation();
      // وجهة إشعارٍ فوري لُمس قبل أن تجهز الواجهة (إطلاقٌ من العدم) تُفتح
      // الآن فوقها — لا فوق شاشة البداية التي تستبدل نفسها.
      if (sl.isRegistered<PushTapRouter>()) sl<PushTapRouter>().markReady();
    });
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
    if (state != AppLifecycleState.resumed) return;
    _checkPendingConfirmation();
    // قرار الإدارة في تقييمٍ (نُشر/رُفض) يصل غالباً والتطبيق في الخلفية؛
    // إعادة التحميل هنا هي ما يُزيل لافتة «صورتك قيد المراجعة» بعد الموافقة.
    if (context.read<AuthCubit>().isLoggedIn) {
      unawaited(context.read<ReviewsCubit>().load());
    }
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
    //
    // المزامنة الحيّة للسلة (CA-14) تعيش هنا لأن الغلاف يبقى مركّباً ما دام
    // الزبون في التطبيق — تحت شاشات الدفع أيضاً — وهو من يعرف التبويب النشط.
    return CartAutoSync(
      tabIndex: mainNavIndex,
      cartTab: MainTab.cart,
      child: Scaffold(
        extendBody: true,
        // [CRITICAL] إطارٌ واحد يغطّي التبويبات الخمسة: تمديدُ واجهةِ هاتفٍ
        // على لوحٍ عرضه ١٣٦٦ يجعل البانرات والبطاقات مفرطةَ الاتّساع وسطورَ
        // النصّ أطولَ من مدى القراءة. الحدّ يوسّط المحتوى ويترك هامشين، بينما
        // شبكةُ المنتجات تملأ العرض المتاح بأعمدةٍ أكثر (`productGridColumns`).
        // وعلى الهاتف — أضيق من الحدّ — لا أثر لهذا الإطار البتّة.
        body: ResponsiveContentFrame(
          maxWidth: kGridMaxWidth,
          child: IndexedStack(index: _index, children: _screens),
        ),
        bottomNavigationBar: BlocBuilder<CartCubit, CartState>(
          builder: (context, cart) => OtakuBottomNav(
            currentIndex: _index,
            raisedIndex: MainTab.community,
            onSelected: (index) async {
              // السلة والحساب تبويبان محميان: الزائر يمرّ عبر البوابة الموحّدة
              // ذاتها في كل مكان، فإن ألغى بقي في التبويب الذي كان فيه، وإن
              // اختار تسجيل الدخول ونجح لاحقاً وصل إلى التبويب الذي طلبه.
              final isProtected =
                  index == MainTab.cart || index == MainTab.account;
              if (isProtected) {
                pendingProtectedTab = null; // إلغاء أي طلب قديم لم يُنجز.
                final granted = await requireAuthentication(
                  context,
                  // [CRITICAL] `gNow` لا `g`.
                  //
                  // هذا الجسم يعمل **عند الضغط** لا أثناء البناء، رغم وقوعه
                  // لفظياً داخل `build`. و`context.g` يقرأ الجنس بـ`watch`،
                  // و`watch` خارج البناء يرمي تأكيداً: «Tried to listen to a
                  // value exposed with provider, from outside of the widget
                  // tree». والوسائط تُقيَّم قبل استدعاء الدالة، فكان الرمي يقع
                  // **قبل** أن يُسأل `isLoggedIn` أصلاً — فيموت المعالِج قبل
                  // `setState`، فلا يتحرّك التبويب ولا تظهر رسالة: مستخدمٌ
                  // مسجَّل يضغط السلة أو الحساب فلا يحدث شيء. `gNow` تقرأ
                  // بـ`read` فتصحّ خارج البناء.
                  title: context.gNow(GenderedStrings.loginFirst),
                  body: index == MainTab.cart
                      ? context.strings('loginRequiredForCart')
                      : context.strings('loginRequiredForAccount'),
                  onLoginRequested: () => pendingProtectedTab = index,
                );
                if (!granted || !mounted) return;
              }
              pendingProtectedTab = null;
              setState(() => _index = index);
              mainNavIndex.value = index;
            },
            items: [
              OtakuNavItem(
                icon: Icons.home_outlined,
                activeIcon: Icons.home_rounded,
                label: context.strings('navHome'),
              ),
              OtakuNavItem(
                icon: Icons.grid_view_outlined,
                activeIcon: Icons.grid_view_rounded,
                label: context.strings('navCategories'),
                gridIconCount: 4,
              ),
              OtakuNavItem(
                icon: Icons.photo_library_outlined,
                activeIcon: Icons.photo_library_rounded,
                label: context.strings('navCommunity'),
              ),
              OtakuNavItem(
                icon: Icons.shopping_bag_outlined,
                activeIcon: Icons.shopping_bag_rounded,
                label: context.strings('navCart'),
                badgeCount: cart.count,
              ),
              OtakuNavItem(
                icon: Icons.person_outline,
                activeIcon: Icons.person_rounded,
                label: context.strings('navAccount'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
