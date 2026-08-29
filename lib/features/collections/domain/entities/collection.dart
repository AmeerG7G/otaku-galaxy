/// مجموعة مفضلة ينشئها العميل لتنظيم منتجاته (خاصة به دائماً — لا مشاركة
/// ولا مجموعات عامة).
///
/// تُخزَّن على الخادم مرتبطةً بالحساب، والملكية تُتحقَّق هناك.
class Collection {
  const Collection({
    required this.id,
    required this.name,
    this.productIds = const [],
  });

  final String id;
  final String name;
  final List<String> productIds;

  int get count => productIds.length;

  Collection copyWith({String? name, List<String>? productIds}) => Collection(
    id: id,
    name: name ?? this.name,
    productIds: productIds ?? this.productIds,
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'productIds': productIds,
  };

  factory Collection.fromJson(Map<String, dynamic> json) => Collection(
    id: json['id'] as String,
    name: json['name'] as String,
    productIds: (json['productIds'] as List? ?? const [])
        .map((e) => e.toString())
        .toList(),
  );
}
