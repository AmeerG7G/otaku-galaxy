import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../products/domain/entities/product.dart';
import '../../data/repositories/favorites_repository_impl.dart';
import '../../domain/repositories/favorites_repository.dart';
import 'favorites_state.dart';

/// يدير قائمة المنتجات المفضلة (إضافة/إزالة/تبديل) — خلفية الخادم.
///
/// مسجّل كـ singleton لأن المفضلة تظهر وتُعدّل في أكثر من شاشة.
class FavoritesCubit extends Cubit<FavoritesState> {
  FavoritesCubit({FavoritesRepository? repository})
    : _repository = repository ?? FavoritesRepositoryImpl(),
      super(const FavoritesEmpty());

  final FavoritesRepository _repository;

  final Map<String, Product> _favorites = {};

  /// تحميل المفضلة من الخادم (بعد تسجيل الدخول أو فتح التطبيق).
  Future<void> load() async {
    try {
      final products = await _repository.fetchFavorites();
      _favorites
        ..clear()
        ..addEntries(products.map((p) => MapEntry(p.id, p)));
      _emit();
    } catch (_) {
      // لا نُفشل الواجهة.
    }
  }

  /// تبديل حالة منتج: إضافة إن لم يكن موجوداً وإزالة العكس.
  Future<void> toggle(Product product) async {
    if (_favorites.containsKey(product.id)) {
      await remove(product.id);
    } else {
      try {
        await _repository.addFavorite(product.id);
        _favorites[product.id] = product;
      } catch (_) {
        // فشل الإضافة — نبقى على الحالة الحالية.
      }
      _emit();
    }
  }

  /// إزالة منتج من المفضلة.
  Future<void> remove(String productId) async {
    _favorites.remove(productId);
    _emit();
    try {
      await _repository.removeFavorite(productId);
    } catch (_) {
      // فشل الحذف — نعيد المحاولة عند التحميل القادم.
    }
  }

  /// مسح المفضلة محلياً (عند تسجيل الخروج).
  void clear() {
    _favorites.clear();
    emit(const FavoritesEmpty());
  }

  void _emit() {
    if (_favorites.isEmpty) {
      emit(const FavoritesEmpty());
    } else {
      emit(FavoritesLoaded(products: _favorites.values.toList()));
    }
  }
}