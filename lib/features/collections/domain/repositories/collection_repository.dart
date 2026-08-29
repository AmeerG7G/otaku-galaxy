import '../entities/collection.dart';

/// واجهة مستودع المجموعات (تعريف فقط).
abstract class CollectionRepository {
  Future<List<Collection>> fetchAll();
  Future<Collection> create(String name);
  Future<void> rename(String id, String name);
  Future<void> delete(String id);
  Future<void> addProduct(String collectionId, String productId);
  Future<void> removeProduct(String collectionId, String productId);
}
