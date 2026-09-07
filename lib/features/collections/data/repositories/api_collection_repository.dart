import '../../../../core/constants/api_endpoints.dart';
import '../../../../core/network/api_client.dart';
import '../../domain/entities/collection.dart';
import '../../domain/repositories/collection_repository.dart';

/// تنفيذ [CollectionRepository] عبر الـ API الحقيقي.
///
/// المجموعات مرتبطة بالحساب على الخادم، والملكية تُتحقَّق هناك — فلا يستطيع
/// عميل قراءة أو تعديل مجموعات غيره حتى لو عرف معرّفها.
class ApiCollectionRepository implements CollectionRepository {
  ApiCollectionRepository({ApiClient? api}) : _api = api ?? ApiClient();

  final ApiClient _api;

  @override
  Future<List<Collection>> fetchAll() async {
    final data = await _api.get(ApiEndpoints.collections);
    return (data as List? ?? const [])
        .map((e) => Collection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  @override
  Future<Collection> create(String name) async {
    final data = await _api.post(
      ApiEndpoints.collections,
      body: {'name': name},
    );
    return Collection.fromJson(data as Map<String, dynamic>);
  }

  @override
  Future<void> rename(String id, String name) async {
    await _api.patch('${ApiEndpoints.collectionItem}$id', body: {'name': name});
  }

  @override
  Future<void> delete(String id) async {
    await _api.delete('${ApiEndpoints.collectionItem}$id');
  }

  @override
  Future<void> addProduct(String collectionId, String productId) async {
    await _api.post(
      '${ApiEndpoints.collectionItem}$collectionId/products',
      body: {'productId': productId},
    );
  }

  @override
  Future<void> removeProduct(String collectionId, String productId) async {
    await _api.delete(
      '${ApiEndpoints.collectionItem}$collectionId/products/$productId',
    );
  }
}
