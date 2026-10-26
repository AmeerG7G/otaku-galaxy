import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../products/domain/entities/product.dart';
import '../../domain/entities/cart_item.dart';
import '../../domain/entities/cart_sync.dart';
import '../../domain/repositories/cart_repository.dart';
import 'cart_state.dart';

/// يدير حالة سلة التسوق (إضافة، زيادة، نقصان، إزالة، مسح) — السلة على الخادم.
///
/// السلة خاصية حساب: لا تُستخدم إلا لمستخدم مسجّل — الزائر يُحوَّل لدعوة
/// تسجيل الدخول قبل أي استدعاء لهذه الكيوبت (انظر [addToCartGuarded]).
/// لا توجد سلة زائر محلية عمداً؛ إضافة/تعديل السلة تتطلب جلسة دائماً.
///
/// مسجّل كـ singleton لأن السلة تظهر وتُعدّل في أكثر من شاشة،
/// والشارة تشترك بالحالة نفسها.
class CartCubit extends Cubit<CartState> {
  CartCubit(this._repository) : super(const CartEmpty());

  final CartRepository _repository;

  List<CartItem> _items = [];

  /// يزداد مع كل حالةٍ تُبثّ — به تعرف المزامنة أن تعديلاً وقع أثناءها.
  int _generation = 0;

  Future<CartSyncNotice?>? _inFlight;

  final _notices = StreamController<CartSyncNotice>.broadcast();

  /// ما يجب أن يُبلَّغ به الزبون بعد كل مزامنةٍ غيّرت شيئاً — رسالة واحدة
  /// مجمَّعة لكل مزامنة (انظر [CartSyncNotice]).
  Stream<CartSyncNotice> get notices => _notices.stream;

  /// تحميل السلة من الخادم (بعد تسجيل الدخول أو فتح التطبيق).
  Future<void> load() => sync();

  /// مزامنة السلة مع الخادم (CA-14) — الخادم مرجع الحقيقة.
  ///
  /// [CRITICAL] اللقطة تُطبَّق **ذرّياً**: حالةٌ واحدة تحمل الأسطر كلها
  /// بأسعارها وكمياتها الجديدة، فلا يرى الزبون مجموعاً قديماً بين تحديث سطرٍ
  /// وآخر. ثم تُبثّ رسالةٌ واحدة إن تغيّر شيء.
  ///
  /// المزامنات المتزامنة تشترك في طلبٍ واحد. وإن عدّل الزبون العربة أثناء
  /// المزامنة (إضافة، كمية، حذف) فردُّ ذلك التعديل أحدث من اللقطة، فلا تكتب
  /// اللقطة فوقه — الرسالة وحدها تُبلَّغ. تُعيد `null` حين يتعذّر الوصول.
  Future<CartSyncNotice?> sync() =>
      _inFlight ??= _runSync().whenComplete(() => _inFlight = null);

  Future<CartSyncNotice?> _runSync() async {
    final started = _generation;
    final shown = _items;
    final CartSnapshot snapshot;
    try {
      snapshot = await _repository.syncCart();
    } catch (_) {
      // غير متصل — نبقي الحالة الحالية.
      return null;
    }
    final notice = CartSyncNotice.between(before: shown, after: snapshot);
    if (_generation == started) {
      _items = snapshot.items;
      _emit();
    }
    if (notice.hasChanges && !_notices.isClosed) _notices.add(notice);
    return notice;
  }

  /// إضافة منتج إلى السلة عبر الخادم (يترك الخادم التحقق من المخزون).
  Future<void> add(
    Product product, {
    int quantity = 1,
    String? selectedOption,
  }) async {
    try {
      _items = await _repository.addToCart(
        product.id,
        optionValue: selectedOption,
        quantity: quantity,
      );
      _emit();
    } catch (_) {
      await _sync();
      rethrow;
    }
  }

  /// زيادة كمية منتج حتى حدود المخزون المتاح.
  Future<void> increase(String productId, {String? selectedOption}) async {
    final item = _itemByProduct(productId, selectedOption);
    if (item == null || item.lineId == null) return;
    if (item.quantity >= item.product.stock) return;
    await _updateQuantity(item.lineId!, item.quantity + 1);
  }

  /// إنقاص كمية منتج؛ تُحذف الكمية الأخيرة من السلة.
  Future<void> decrease(String productId, {String? selectedOption}) async {
    final item = _itemByProduct(productId, selectedOption);
    if (item == null) return;
    if (item.quantity <= 1) {
      await remove(productId, selectedOption: selectedOption);
      return;
    }
    if (item.lineId == null) return;
    await _updateQuantity(item.lineId!, item.quantity - 1);
  }

  /// إزالة منتج من السلة نهائياً.
  Future<void> remove(String productId, {String? selectedOption}) async {
    final item = _itemByProduct(productId, selectedOption);
    if (item == null) return;
    if (item.lineId == null) {
      _items = _items.where((it) => it.product.id != productId).toList();
      _emit();
      return;
    }
    try {
      _items = await _repository.removeFromCart(item.lineId!);
      _emit();
    } catch (_) {
      await _sync();
    }
  }

  /// مسح السلة محلياً (يُفرّغ الخادم السلة عند إنشاء الطلب).
  void clear() {
    _items = [];
    _emit();
  }

  Future<void> _updateQuantity(String lineId, int quantity) async {
    try {
      _items = await _repository.updateQuantity(lineId, quantity);
    } catch (_) {
      await _sync();
    }
    _emit();
  }

  /// مزامنة مع الخادم لتصحيح أي اختلاف بعد تعديلٍ فشل.
  Future<void> _sync() => sync();

  CartItem? _itemByProduct(String productId, String? selectedOption) {
    for (final item in _items) {
      if (item.product.id == productId &&
          item.selectedOption == selectedOption) {
        return item;
      }
    }
    for (final item in _items) {
      if (item.product.id == productId) return item;
    }
    return null;
  }

  void _emit() {
    _generation++;
    if (_items.isEmpty) {
      emit(const CartEmpty());
    } else {
      emit(CartLoaded(items: List.unmodifiable(_items)));
    }
  }

  @override
  Future<void> close() async {
    await _notices.close();
    return super.close();
  }
}
