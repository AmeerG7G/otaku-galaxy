import 'package:flutter_bloc/flutter_bloc.dart';

import '../../domain/entities/collection.dart';
import '../../domain/repositories/collection_repository.dart';

class CollectionsState {
  const CollectionsState({
    this.items = const [],
    this.loading = false,
    this.error,
  });

  final List<Collection> items;
  final bool loading;

  /// رسالة فشل آخر تحميل — تُعرض كحالة خطأ قابلة لإعادة المحاولة.
  final String? error;
}

class CollectionsCubit extends Cubit<CollectionsState> {
  CollectionsCubit(this._repository) : super(const CollectionsState());

  final CollectionRepository _repository;

  Future<void> load() async {
    emit(CollectionsState(items: state.items, loading: true));
    try {
      final items = await _repository.fetchAll();
      emit(CollectionsState(items: items, loading: false));
    } catch (e) {
      emit(CollectionsState(items: state.items, loading: false, error: '$e'));
    }
  }

  Future<void> create(String name) async {
    await _repository.create(name);
    await load();
  }

  Future<void> rename(String id, String name) async {
    await _repository.rename(id, name);
    await load();
  }

  Future<void> delete(String id) async {
    await _repository.delete(id);
    await load();
  }

  Future<void> addProduct(String collectionId, String productId) async {
    await _repository.addProduct(collectionId, productId);
    await load();
  }

  Future<void> removeProduct(String collectionId, String productId) async {
    await _repository.removeProduct(collectionId, productId);
    await load();
  }

  /// المجموعات التي تحتوي منتجاً معيّناً — لتحديد حالة الأزرار في الورقة.
  bool contains(String collectionId, String productId) {
    for (final c in state.items) {
      if (c.id == collectionId) return c.productIds.contains(productId);
    }
    return false;
  }

  /// يُفرغ المجموعات عند تبديل الحساب — المجموعات خاصة بكل مستخدم.
  void clear() => emit(const CollectionsState());
}
