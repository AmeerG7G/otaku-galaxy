import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/design_system/design_system.dart';
import '../../../core/l10n/app_strings.dart';
import '../../auth/presentation/cubit/auth_cubit.dart';
import '../domain/entities/cart_sync.dart';
import 'cubit/cart_cubit.dart';

/// يُبقي العربة النشطة متزامنة مع الخادم، ويُبلغ الزبون بما تغيّر (CA-14).
///
/// ═══ لماذا استطلاعٌ خفيف لا قناةٌ لحظية ═══
/// السعر والمخزون يتغيّران من لوحة الإدارة بضع مرات في اليوم، والعربة لا
/// تُقرأ إلا في جلسةٍ مفتوحة. `GET /cart` نفسه يعيد الأسعار حيّةً وما عدّله
/// الخادم، فطلبٌ واحد يكفي لكل العربة — بلا WebSocket ولا بنيةٍ جديدة على
/// الخادم. والإرسال يتحقّق أخيراً على أي حال (`409`).
///
/// متى تقع المزامنة:
///   • العودة إلى التطبيق من الخلفية — فوراً.
///   • كل [interval] ما دام التطبيق في المقدّمة والزبون مسجَّلاً والعربة غير
///     فارغة. لا مؤقّت في الخلفية، ولا طلب لعربةٍ فارغة.
///   • فتح تبويب السلة ([tabIndex] == [cartTab]).
///   • قبل الانتقال إلى الدفع (زرّ «إتمام الطلب» في شاشة السلة نفسها).
///
/// الرسالة: شريطٌ واحد مجمَّع لكل مزامنة (`showOtakuSnack`)، لا شريطٌ لكل منتج.
class CartAutoSync extends StatefulWidget {
  const CartAutoSync({
    super.key,
    required this.child,
    this.interval = defaultInterval,
    this.tabIndex,
    this.cartTab,
  });

  /// كل دقيقة في المقدّمة: طلبٌ واحد صغير لكل زبونٍ عربته مفتوحة.
  static const defaultInterval = Duration(seconds: 60);

  final Widget child;
  final Duration interval;

  /// التبويب النشط في الغلاف الرئيسي — فتحُ السلة يزامن.
  final ValueListenable<int>? tabIndex;
  final int? cartTab;

  @override
  State<CartAutoSync> createState() => _CartAutoSyncState();
}

class _CartAutoSyncState extends State<CartAutoSync>
    with WidgetsBindingObserver {
  Timer? _timer;
  StreamSubscription<CartSyncNotice>? _notices;
  late final CartCubit _cart;

  @override
  void initState() {
    super.initState();
    _cart = context.read<CartCubit>();
    _notices = _cart.notices.listen(_show);
    WidgetsBinding.instance.addObserver(this);
    widget.tabIndex?.addListener(_onTab);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (lifecycle == null || lifecycle == AppLifecycleState.resumed) {
      _startTimer();
    }
  }

  @override
  void dispose() {
    widget.tabIndex?.removeListener(_onTab);
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _notices?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _syncIfActive(evenIfEmpty: true);
      _startTimer();
    } else {
      // لا طلبات والتطبيق خارج المقدّمة.
      _timer?.cancel();
      _timer = null;
    }
  }

  void _startTimer() {
    _timer?.cancel();
    _timer = Timer.periodic(widget.interval, (_) => _syncIfActive());
  }

  void _onTab() {
    if (widget.tabIndex?.value == widget.cartTab) {
      _syncIfActive(evenIfEmpty: true);
    }
  }

  /// [evenIfEmpty]: العودة للتطبيق وفتح التبويب يزامنان عربةً فارغة محلياً
  /// أيضاً (قد تكون مُلئت من جهاز آخر)؛ المؤقّت وحده يكتفي بالعربة غير الفارغة.
  void _syncIfActive({bool evenIfEmpty = false}) {
    if (!mounted) return;
    if (!context.read<AuthCubit>().isLoggedIn) return;
    if (!evenIfEmpty && _cart.state.items.isEmpty) return;
    unawaited(_cart.sync());
  }

  void _show(CartSyncNotice notice) {
    if (!mounted) return;
    final strings = context.strings;
    showOtakuSnack(
      context,
      message: notice.messageKeys.map(strings.call).join('\n'),
      tone: OtakuSnackTone.error,
    );
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
