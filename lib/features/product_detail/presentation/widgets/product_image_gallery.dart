import 'package:flutter/material.dart';

import '../../../../core/design_system/design_system.dart';

/// صور المعرض بترتيبها: صورة اللون المختار [leading] أولاً إن وُجدت (STEP 74)،
/// ثم صور المنتج العادية كما أرسلها الخادم (`sort_order`)، بلا تكرار صورةٍ
/// هي نفسها صورة اللون، وبلا روابط فارغة.
List<String> productGalleryImages(List<String> images, {String? leading}) {
  final lead = leading?.trim();
  return [
    if (lead != null && lead.isNotEmpty) lead,
    for (final url in images)
      if (url.trim().isNotEmpty && url.trim() != lead) url,
  ];
}

/// معرض صور المنتج في فتحة صفحة التفاصيل.
///
/// كانت الفتحة تعرض الصورة الأولى وحدها ونقاطاً ثابتة لا تتحرّك، فبقيت بقية
/// الصور المرفوعة لا تُرى. هنا: سحبٌ بين الصور بحدّي الأولى والأخيرة (بلا
/// التفاف)، ونقطةٌ لكل صورة تتبع الصورة المعروضة وتنقل إليها باللمس. صورةٌ
/// واحدة أو لا صور: الفتحة كما كانت بلا نقاط. الصورة التي يفشل تحميلها
/// يعرضها [ProductPhotoSlot] ببديله المحايد.
///
/// اختيارٌ جديد للّون يغيّر [images] من أوّلها — المستدعي يعطي المعرض مفتاحاً
/// بصورته الأولى فيبدأ من جديد على صورة اللون.
class ProductImageGallery extends StatefulWidget {
  const ProductImageGallery({
    super.key,
    required this.images,
    this.iconSize = 70,
  });

  final List<String> images;
  final double iconSize;

  @override
  State<ProductImageGallery> createState() => _ProductImageGalleryState();
}

class _ProductImageGalleryState extends State<ProductImageGallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void didUpdateWidget(covariant ProductImageGallery oldWidget) {
    super.didUpdateWidget(oldWidget);
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
          onPageChanged: (i) => setState(() => _index = i),
          itemBuilder: (context, i) => ProductPhotoSlot(
            // مفتاح البطل على الصورة المعروضة وحدها.
            key: i == _index ? const Key('product_hero_image') : null,
            imageUrl: images[i],
            iconSize: widget.iconSize,
          ),
        ),
        // مؤشّرات الصور أسفل الفتحة — النشطة أعرض وبلون الإبراز.
        PositionedDirectional(
          start: 0,
          end: 0,
          bottom: 10,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < images.length; i++) ...[
                if (i > 0) const SizedBox(width: 6),
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => _controller.animateToPage(
                    i,
                    duration: const Duration(milliseconds: 250),
                    curve: Curves.easeOut,
                  ),
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
      ],
    );
  }
}
