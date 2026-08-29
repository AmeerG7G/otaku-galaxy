import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../products/domain/entities/product.dart';
import '../../domain/entities/cart_item.dart';
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

  /// تحميل السلة من الخادم (بعد تسجيل الدخول أو فتح التطبيق).
  Future<void> load() async {
    try {
      _items = await _repository.fetchCart();
      _emit();
    } catch (_) {
      // لا نُفشل الواجهة؛ تبقى السلة كما هي.
    }
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
    emit(const CartEmpty());
  }

  Future<void> _updateQuantity(String lineId, int quantity) async {
    try {
      _items = await _repository.updateQuantity(lineId, quantity);
    } catch (_) {
      await _sync();
    }
    _emit();
  }

  /// مزامنة مع الخادم لتصحيح أي اختلاف.
  Future<void> _sync() async {
    try {
      _items = await _repository.fetchCart();
      _emit();
    } catch (_) {
      // غير متصل — نبقي الحالة الحالية.
    }
  }

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
    if (_items.isEmpty) {
      emit(const CartEmpty());
    } else {
      emit(CartLoaded(items: List.unmodifiable(_items)));
    }
  }
}
