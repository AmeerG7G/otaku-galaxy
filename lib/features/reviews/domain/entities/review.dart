import '../../../../core/l10n/bilingual_text.dart';
import '../../../../core/network/media_url.dart';

/// حالة التقييم — يبدأ دائماً بانتظار المراجعة، ثم يُنشر أو يُرفض.
enum ReviewStatus { pending, approved, rejected }

/// تقييم عميل لمنتج ضمن طلب مكتمل.
///
/// يأتي من جدول التقييمات على الخادم عبر [ReviewRepository]. لا يُنشر
/// التقييم قبل اعتماده من لوحة التحكم، والمرفوض يحمل سبباً يظهر للعميل
/// ليعدّله ويعيد إرساله.
class Review {
  const Review({
    required this.id,
    required this.productId,
    required this.productNames,
    required this.orderId,
    required this.rating,
    required this.comment,
    this.photoUrls = const [],
    List<String>? photoRefs,
    required this.status,
    this.rejectionReason,
    required this.customerName,
    required this.createdAt,
    this.categoryId,
    this.categoryName,
  }) : photoRefs = photoRefs ?? photoUrls;

  final String id;
  final String productId;

  /// اسم المنتج — **لقطة** سطر الطلب باللغتين (هجرة ٠٦٦)، لا اسمه الحالي.
  /// يُعرض بلغة الواجهة: `productNames.of(context.language)`. تقييمٌ أقدم من
  /// 066 بلا كردية ⇒ `ckb == null` صريحة.
  final BilingualText productNames;
  final String orderId;

  /// من ١ إلى ٥.
  final int rating;
  final String comment;

  /// صور التقييم — من صفر إلى خمس، بترتيب إضافتها.
  ///
  /// كانت صورةً واحدة (`photoUrl`). المكافأة مقطوعة (خمس نقاط للتقييم مهما
  /// بلغ العدد)، والسقف يفرضه الخادم والقاعدة معاً لا هذه الطبقة.
  final List<String> photoUrls;

  /// مراجع الصور **كما يخزّنها الخادم** (`/uploads/…`، أو رابطٌ خارجي كامل)
  /// — بترتيب [photoUrls] نفسه.
  ///
  /// [CRITICAL] هذا ما يُعاد إرساله عند تعديل تقييمٍ مرفوض، لا [photoUrls].
  /// رابط العرض يُبنى من أصل البيئة الحالية (`localhost` من سطح المكتب،
  /// `10.0.2.2` من المحاكي، نطاقٌ آخر في الإنتاج)، والخادم يرفض أي أصلٍ
  /// غير أصله؛ فإرسالُ رابط العرض كان يجعل التقييم المرفوض بصورةٍ غيرَ
  /// قابلٍ للتصحيح على الهاتف. المرجع هو الهوية؛ الرابط للعرض وحده.
  final List<String> photoRefs;

  /// أول صورة أو `null` — للشاشات التي تعرض صورة واحدة (المجتمع، بطاقة
  /// التقييم). حقلٌ مشتقّ لا مصدرٌ ثانٍ.
  String? get photoUrl => photoUrls.isEmpty ? null : photoUrls.first;

  final ReviewStatus status;

  /// سبب الرفض — غير فارغ فقط عندما تكون الحالة [ReviewStatus.rejected].
  final String? rejectionReason;

  final String customerName;
  final DateTime createdAt;

  /// قسم المنتج — يرسله الخادم مع صور المجتمع فقط، ومفتاح الفلترة المستقر.
  final String? categoryId;
  final String? categoryName;

  bool get hasPhoto => photoUrls.isNotEmpty;

  Review copyWith({
    int? rating,
    String? comment,
    List<String>? photoUrls,
    List<String>? photoRefs,
    bool clearPhotos = false,
    ReviewStatus? status,
    String? rejectionReason,
    bool clearRejectionReason = false,
  }) {
    return Review(
      id: id,
      productId: productId,
      productNames: productNames,
      orderId: orderId,
      rating: rating ?? this.rating,
      comment: comment ?? this.comment,
      photoUrls: clearPhotos ? const [] : (photoUrls ?? this.photoUrls),
      photoRefs: clearPhotos ? const [] : (photoRefs ?? this.photoRefs),
      status: status ?? this.status,
      rejectionReason: clearRejectionReason
          ? null
          : (rejectionReason ?? this.rejectionReason),
      customerName: customerName,
      createdAt: createdAt,
    );
  }

  Map<String, dynamic> toJson() => {
    'id': id,
    'productId': productId,
    'productName': productNames.ar,
    'productNameAr': productNames.ar,
    'productNameCkb': productNames.ckb,
    'orderId': orderId,
    'rating': rating,
    'comment': comment,
    // مفتاح السلك اسمه `photoUrls` وقيمته المراجع كما يخزّنها الخادم.
    'photoUrls': photoRefs,
    'status': status.name,
    'rejectionReason': rejectionReason,
    'customerName': customerName,
    'createdAt': createdAt.toIso8601String(),
  };

  factory Review.fromJson(Map<String, dynamic> json) {
    final refs = _photoRefsOf(json);
    return Review(
      id: json['id'] as String,
      productId: json['productId'] as String,
      productNames: BilingualText.fromJson(
        json,
        arKey: 'productNameAr',
        ckbKey: 'productNameCkb',
        legacyKey: 'productName',
      ),
      orderId: json['orderId'] as String,
      rating: json['rating'] as int,
      comment: json['comment'] as String,
      // كل مرجع يُحلّ إلى الأصل الفعّال الآن؛ الفارغ يسقط بدل أن يصير رابطاً
      // مكسوراً في شبكة الصور. المراجع الخام تُحفظ جنباً إلى جنب لإعادة
      // الإرسال — الترتيب واحد لأن الفارغ يُسقَط من الاثنين.
      photoUrls: [for (final ref in refs) ?resolveMediaUrl(ref)],
      photoRefs: refs,
      status: ReviewStatus.values.byName(json['status'] as String),
      rejectionReason: json['rejectionReason'] as String?,
      customerName: json['customerName'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
      categoryId: json['categoryId'] as String?,
      categoryName: json['categoryName'] as String?,
    );
  }
}

/// المراجع غير الفارغة كما وردت من الخادم، بترتيبها.
List<String> _photoRefsOf(Map<String, dynamic> json) => [
  for (final raw in (json['photoUrls'] as List? ?? const []))
    if (raw != null && raw.toString().trim().isNotEmpty) raw.toString().trim(),
];
