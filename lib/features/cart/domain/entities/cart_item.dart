import '../../../../core/l10n/bilingual_text.dart';
import '../../../products/domain/entities/product.dart';
import '../../../settings/presentation/cubit/locale_cubit.dart';

/// لون سطر سلة أو طلب (STEP 74) كما أرسله الخادم مع السطر.
///
/// [CRITICAL] في السطر `variantColorName` **عربي** (كـ`productName`)؛ الاسم
/// المعروض يُختار من `variantColorNameAr`/`variantColorNameCkb` بلغة الواجهة
/// الآن ([nameIn]) — الكردية الناقصة تسقط إلى العربية. في الطلب هو **لقطة**
/// وقت الطلب: تعديل اللون أو حذفه لاحقاً لا يغيّره.
class LineColor {
  const LineColor({
    required this.variantId,
    required this.names,
    this.colorHex,
    this.kind = VariantKind.color,
  });

  /// `null` حين لا يحمل السطر لوناً (سطرٌ قديم، أو ردٌّ أقدم من 087).
  static LineColor? fromLineJson(Map<String, dynamic> json) {
    final id = json['variantId']?.toString();
    if (id == null || id.isEmpty) return null;
    final hex = json['variantColorHex']?.toString().trim();
    return LineColor(
      variantId: id,
      names: BilingualText.fromJson(
        json,
        arKey: 'variantColorNameAr',
        ckbKey: 'variantColorNameCkb',
        legacyKey: 'variantColorName',
      ),
      colorHex: hex == null || hex.isEmpty ? null : hex,
      // لقطة الطلب أو المنتج الحالي للعربة (090)؛ الغائب لون.
      kind: VariantKind.parse(json['variantKind']),
    );
  }

  final String variantId;
  final BilingualText names;
  final String? colorHex;

  /// ما يمثّله الخيار — يسمّي السطر «اللون:» أو «التصميم:» أو «المقاس:».
  final VariantKind kind;

  String nameIn(AppLanguage language) => names.of(language);
}

class CartItem {
  const CartItem({
    required this.product,
    this.quantity = 1,
    this.selectedOption,
    this.lineId,
    this.serverLineTotal,
    this.color,
  });

  final Product product;
  final int quantity;
  final String? selectedOption;

  /// معرّف سطر العربة لدى الخادم (لتحديث الكمية/الحذف).
  final String? lineId;

  /// مبلغ السطر كما حسبه الخادم (`lineTotal`) — بعد عرض «قطعتان بسعر» (085)
  /// على أسطر المنتج كلها، فقد يقلّ عن السعر × الكمية. `null` = سطرٌ لم يصل من
  /// الخادم (اختبارات، أو ردٌّ أقدم) فيُحسب كما كان.
  final double? serverLineTotal;

  /// لون السطر (STEP 74)؛ `null` = سطر منتجٍ بلا ألوان. المنتج نفسه بلونين
  /// سطران مستقلّان، وصورة السطر ([Product.images]) صورة اللون.
  final LineColor? color;

  /// [CRITICAL] لا يُعاد حساب العرض هنا: قطعتان بخيارين من المنتج نفسه عرضٌ
  /// واحد يعرفه الخادم وحده، والسطر يعرض ما سيُحفظ في الطلب.
  double get lineTotal => serverLineTotal ?? product.price * quantity;

  // [REMOVED] `CartItem.fromJson` — لم يكن يُستدعى قط، وكان يقرأ
  // `json['product']` بينما الخادم يعيد سطر سلة مسطّحاً بلا هذا المفتاح
  // إطلاقاً. أي استعمال له كان سيرمي وقت التشغيل. التحويل الحقيقي والوحيد
  // هو `CartRepositoryImpl._mapLine`، وهو يقرأ الشكل الذي يرسله الخادم فعلاً.

  CartItem copyWith({int? quantity, String? selectedOption, String? lineId}) {
    return CartItem(
      product: product,
      quantity: quantity ?? this.quantity,
      selectedOption: selectedOption ?? this.selectedOption,
      lineId: lineId ?? this.lineId,
      // مبلغ الخادم يخصّ كميته — كميةٌ أخرى تنتظر ردّه لا تحمل مبلغاً قديماً.
      serverLineTotal:
          quantity == null || quantity == this.quantity ? serverLineTotal : null,
      color: color,
    );
  }
}

/// اسم السطر للعرض في جملة («المنتج — اللون»)، بالصيغة التي يكتبها الخادم في
/// رسائله. سطرٌ بلا لون = اسم المنتج وحده.
String lineDisplayName(CartItem item, AppLanguage language) {
  final name = localizedProductName(item.product, language);
  final color = item.color;
  return color == null ? name : '$name — ${color.nameIn(language)}';
}
