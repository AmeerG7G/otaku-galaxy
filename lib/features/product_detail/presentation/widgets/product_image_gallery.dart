import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../products/domain/entities/product_variant.dart';

/// صور المعرض الموحّد بترتيبه الثابت:
///
/// ١. صورة كل لونٍ من [colours] (الفعّالة كما يراها الزبون) بترتيب الألوان
///    (`sortOrder`) — لكل لونٍ صورته الأساسية الواحدة (STEP 74).
/// ٢. ثم صور المنتج العامة [images] كما أرسلها الخادم (`sort_order`).
///
/// الصورة تُعرف بمرجعها المخزَّن محلولاً (`resolveMediaUrl` نفسها لصور
/// المنتج وصور الألوان)، فصورةٌ هي صورة لونٍ ومرفوعةٌ صورةً عامة أيضاً تظهر
/// مرةً واحدة في موضع اللون. الروابط الفارغة تسقط.
List<String> productGalleryImages(
  List<String> images, {
  List<ProductVariant> colours = const [],
}) {
  final seen = <String>{};
  return [
    for (final url in [
      for (final colour in colours) ?colour.imageUrl,
      ...images,
    ])
      if (url.trim().isNotEmpty && seen.add(url.trim())) url.trim(),
  ];
}

/// معرض صور المنتج في فتحة صفحة التفاصيل.
///
/// سحبٌ بين الصور بحدّي الأولى والأخيرة (بلا التفاف)، ونقطةٌ لكل صورة تتبع
/// الصورة المعروضة وتنقل إليها باللمس. صورةٌ واحدة أو لا صور: الفتحة كما
/// كانت بلا نقاط. الصورة التي يفشل تحميلها يعرضها [ProductPhotoSlot] ببديله
/// المحايد.
///
/// [CRITICAL] تصفّح المعرض **لا يختار** لوناً: المعرض يعرض الصور فقط ولا
/// يبلّغ أحداً بالصفحة المعروضة. العكس وحده صحيح: اختيار لون (من المنتقي)
/// يرسل [focusImage] مع [focusRequest] جديد فينتقل المعرض إلى صورته.
///
/// التحميل المسبق محدود: الصورتان المجاورتان للمعروضة وحدهما
/// ([precacheImage] على مفتاح [Image.network] نفسه، فلا تنزيلٌ مزدوج)،
/// فالسحب يجد الصورة التالية جاهزة. لا تُحمَّل كل الصور: الصور المرفوعة
/// بحجمها الأصلي (حتى ٢٤٠٠×٢٤٠٠ ≈ ٢٣ م.ب. مفكوكة) لا يتّسع لأكثر من أربعٍ
/// منها مخزن الصور (١٠٠ م.ب.) — قيس تحميل الكل فأُخرجت الصور قبل عرضها
/// وأعيد تنزيلها (٢٨ تنزيلاً زائداً لثلاثين صورة) وبلغت الذاكرة ~٩٣٠ م.ب.
///
/// والانتقال إلى صورةٍ بعيدة (لونٌ مختار، نقطةٌ بعيدة) قفزةٌ لا تحريك:
/// التحريك يبني كل صفحةٍ في الطريق فيطلب صورها كلها.
class ProductImageGallery extends StatefulWidget {
  const ProductImageGallery({
    super.key,
    required this.images,
    this.focusImage,
    this.focusRequest = 0,
    this.iconSize = 70,
  });

  final List<String> images;

  /// الصورة التي يُطلب عرضها (صورة اللون المختار) — تُنفَّذ حين يتغيّر
  /// [focusRequest]، فاختيار اللون نفسه مرةً ثانية يعيد إليه كذلك.
  final String? focusImage;
  final int focusRequest;
  final double iconSize;

  @override
  State<ProductImageGallery> createState() => _ProductImageGalleryState();
}

class _ProductImageGalleryState extends State<ProductImageGallery> {
  late final PageController _controller = PageController(
    initialPage: _focusIndex() ?? 0,
  );
  late int _index = _focusIndex() ?? 0;

  int? _focusIndex() {
    final focus = widget.focusImage;
    if (focus == null) return null;
    final i = widget.images.indexOf(focus);
    return i < 0 ? null : i;
  }

  /// يحمّل جارتَي الصفحة [index] مسبقاً — صورةٌ في المخزن لا تُطلب ثانية.
  void _precacheAround(int index) {
    final images = widget.images;
    for (final i in [index - 1, index + 1]) {
      if (i < 0 || i >= images.length) continue;
      // الفشل يعرضه [ProductPhotoSlot] ببديله — لا شيء يُبلَّغ هنا.
      precacheImage(NetworkImage(images[i]), context, onError: (_, _) {});
    }
  }

  /// إلى الصفحة [page]: تحريكٌ للمجاورة، وقفزةٌ لما أبعد (انظر أعلاه).
  void _goTo(int page) {
    if (!_controller.hasClients) return;
    final current = _controller.page?.round() ?? _index;
    if ((page - current).abs() <= 1) {
      _controller.animateToPage(
        page,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    } else {
      _controller.jumpToPage(page);
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _precacheAround(_index);
  }

  @override
  void didUpdateWidget(covariant ProductImageGallery oldWidget) {
    super.didUpdateWidget(oldWidget);
    final focus = _focusIndex();
    if (widget.focusRequest != oldWidget.focusRequest && focus != null) {
      _index = focus;
      _precacheAround(focus);
      // بعد الإطار: القفزة تستدعي `onPageChanged` (`setState`) — لا أثناء البناء.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _goTo(focus);
      });
      return;
    }
    // إعادة جلبٍ قصّرت القائمة (لغةٌ أخرى، صورةٌ حُذفت) — لا نقطة نشطة خارجها.
    final last = widget.images.isEmpty ? 0 : widget.images.length - 1;
    if (_index > last) {
      _index = last;
      if (_controller.hasClients) _controller.jumpToPage(last);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    if (images.length < 2) {
      return ProductPhotoSlot(
        key: const Key('product_hero_image'),
        imageUrl: images.isEmpty ? null : images.first,
        iconSize: widget.iconSize,
      );
    }

    final theme = Theme.of(context);
    return Stack(
      fit: StackFit.expand,
      children: [
        PageView.builder(
          key: const Key('product_gallery'),
          controller: _controller,
          itemCount: images.length,
          onPageChanged: (i) {
            setState(() => _index = i);
            _precacheAround(i);
          },
          itemBuilder: (context, i) => ProductPhotoSlot(
            // مفتاح البطل على الصورة المعروضة وحدها.
            key: i == _index ? const Key('product_hero_image') : null,
            imageUrl: images[i],
            iconSize: widget.iconSize,
          ),
        ),
        // مؤشّرات الصور أسفل الفتحة — النشطة أعرض وبلون الإبراز. ألوانٌ كثيرة
        // مع صورٍ عامة قد تتجاوز عرض الهاتف، فيصغر الصفّ ولا يفيض.
        PositionedDirectional(
          start: 16,
          end: 16,
          bottom: 10,
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (var i = 0; i < images.length; i++) ...[
                  if (i > 0) const SizedBox(width: 6),
                  GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => _goTo(i),
                    // هامشٌ عمودي يوسّع مساحة اللمس دون أن تتحرّك النقطة
                    // (`bottom: 10` + ٨ = موضعها القديم ١٨).
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      child: AnimatedContainer(
                        key: Key('product_gallery_dot_$i'),
                        duration: const Duration(milliseconds: 200),
                        width: i == _index ? 18 : 6,
                        height: 6,
                        decoration: BoxDecoration(
                          color: i == _index
                              ? AppColors.secondary
                              : theme.colorScheme.outline,
                          borderRadius: BorderRadius.circular(
                            AppDimens.radiusFull,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}
