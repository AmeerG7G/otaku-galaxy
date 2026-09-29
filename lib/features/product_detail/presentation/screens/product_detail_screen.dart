import 'package:auto_route/auto_route.dart';
import '../../../../core/l10n/app_strings.dart';
import '../../../../core/l10n/locale_refetch.dart';
import '../../../../core/utils/formatters.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:share_plus/share_plus.dart';

import '../../../../core/auth/require_auth.dart';
import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart' show sl;
import '../../../../core/l10n/gender.dart';
import '../../../cart/presentation/cart_actions.dart';
import '../../../collections/presentation/widgets/add_to_collection_sheet.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../favorites/presentation/favorite_toggle.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_product_details_usecase.dart';
import '../../../reviews/presentation/widgets/product_reviews_section.dart';
import '../../../visuals/domain/visual_slot.dart';
import '../../../visuals/presentation/character_artwork.dart';
import '../../../restock/presentation/restock_notify_button.dart';
import '../../../settings/data/store_settings_repository.dart';
import '../utils/product_share.dart';

/// تفاصيل المنتج بتصميم Otaku Galaxy v2.
///
/// فتحة صورة ثابتة بارتفاع ٣٣٠ تعلوها أزرار عائمة مربّعة (بلا `SliverAppBar`
/// ينهار)، ثم كتلة تحريرية بالقسم والاسم والسعر، ثم الوصف والخيارات
/// والكمية، ثم شريط إجراء سفلي ثابت يخرج من خلفه رسم شخصية.
/// ما يتدلّى من صندوق رسم التفاصيل (الصورة 16) خلف حافة الشاشة اليسرى —
/// من هامش الصورة الشفّاف وحده (انظر `_buildDetails`).
const double _productArtOverhang = 23;

/// «قليلاً إلى اليسار» (STEP 64 §18، طلب المالك): كان أوّل بكسلٍ مرئي على
/// بُعد ~٤ من الحافة؛ الإزاحة تستهلك هذه المسافة كلّها فتلامس الشخصيةُ الحافة
/// دون أن تُقصّ (قيد «لا يعبر الحافة» باقٍ). الموضع لا الصورة: 16.png لا تُمسّ،
/// والشخصيات الأخرى لا تتحرّك.
const double _productArtShiftLeft = 4;

/// أقصى انتظارٍ لرابط المتجر عند المشاركة إن لم يكن مخبّأً.
const Duration _shareUrlRefreshTimeout = Duration(seconds: 3);

@RoutePage()
class ProductDetailScreen extends StatefulWidget {
  const ProductDetailScreen({super.key, required this.productId});

  final String productId;

  @override
  State<ProductDetailScreen> createState() => _ProductDetailScreenState();
}

class _ProductDetailScreenState extends State<ProductDetailScreen>
    with LocaleRefetch {
  Product? _product;
  bool _loading = true;
  int _quantity = 1;
  final Map<String, String> _selectedOptions = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// المحتوى الخادمي يُصرَّف لحظة الجلب — يُعاد جلبه بلغة الواجهة الجديدة.
  @override
  void onLanguageChanged() => _load();

  Future<void> _load() async {
    try {
      final fetchDetails = context.read<FetchProductDetailsUsecase>();
      final product = await fetchDetails(widget.productId);
      if (!mounted) return;
      setState(() => _product = product);
    } catch (_) {
      if (!mounted) return;
      setState(() => _product = null);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final product = _product;
    final isFavorite =
        product != null &&
        context.select<FavoritesCubit, bool>(
          (cubit) => cubit.state.isFavorite(product.id),
        );

    if (_loading) return Scaffold(body: _buildLoadingState());
    if (product == null) return Scaffold(body: _buildErrorState());

    return Scaffold(
      // عمودٌ موسَّط بعرض القراءة على اللوح — صورةٌ بطول ٣٣٠ وعرضِ ١٣٦٦
      // تصير شريطاً، ووصفُ المنتج سطوراً أطول من مدى القراءة. شريط الشراء
      // يدخل الإطار معها فيبقى تحت المحتوى الذي يخصّه لا مفروداً بعيداً
      // عنه. لا أثر لهذا على الهاتف.
      body: ResponsiveContentFrame(
        maxWidth: kReadingMaxWidth,
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: EdgeInsets.zero,
                children: [
                  _buildHero(product, isFavorite),
                  _buildDetails(product),
                ],
              ),
            ),
            _buildBottomBar(product),
          ],
        ),
      ),
    );
  }

  /// فتحة صورة المنتج الكبيرة مع أزرار عائمة — الفتحة تبقى محايدة تماماً.
  Widget _buildHero(Product product, bool isFavorite) {
    final theme = Theme.of(context);

    return SizedBox(
      height: 330,
      child: Stack(
        fit: StackFit.expand,
        children: [
          DecoratedBox(
            decoration: BoxDecoration(
              border: Border(
                bottom: BorderSide(color: theme.colorScheme.outlineVariant),
              ),
            ),
            child: ProductPhotoSlot(
              imageUrl: product.images.isNotEmpty ? product.images.first : null,
              iconSize: 70,
            ),
          ),
          SafeArea(
            bottom: false,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _HeroButton(
                    icon: Directionality.of(context) == TextDirection.rtl
                        ? Icons.arrow_forward_ios_rounded
                        : Icons.arrow_back_ios_new_rounded,
                    onTap: () => context.router.maybePop(),
                  ),
                  const Spacer(),
                  _HeroButton(
                    icon: Icons.ios_share_rounded,
                    onTap: () => _shareProduct(product),
                  ),
                  const SizedBox(width: 9),
                  _HeroButton(
                    icon: isFavorite
                        ? Icons.favorite_rounded
                        : Icons.favorite_border_rounded,
                    filled: isFavorite,
                    onTap: () => toggleFavoriteGuarded(context, product),
                  ),
                ],
              ),
            ),
          ),
          // مؤشّرات الصور أسفل الفتحة.
          if (product.images.length > 1)
            PositionedDirectional(
              start: 0,
              end: 0,
              bottom: 18,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < product.images.length; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Container(
                      width: i == 0 ? 18 : 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: i == 0
                            ? AppColors.secondary
                            : theme.colorScheme.outline,
                        borderRadius: BorderRadius.circular(
                          AppDimens.radiusFull,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          if (!product.inStock)
            PositionedDirectional(
              start: 0,
              end: 0,
              bottom: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                alignment: Alignment.center,
                color: const Color(0xFF180F30).withValues(alpha: 0.74),
                child: Text(
                  // نفس القاعدة: المنتظَر بموعد لا يُقال عنه «نفد».
                  context.strings(
                    product.availability == ProductAvailability.comingSoon
                        ? 'comingSoon'
                        : 'outOfStock',
                  ),
                  style: theme.textTheme.labelMedium?.copyWith(
                    fontSize: 11,
                    fontWeight: AppDimens.weightExtraBold,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  /// جسم الصفحة — كتلة تحريرية برسم باهت خلفها.
  Widget _buildDetails(Product product) {
    final theme = Theme.of(context);
    final missingOption =
        product.options != null &&
        product.options!.isNotEmpty &&
        _selectedOptions.length < product.options!.length;

    return Container(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 14),
      // تقصّ عند حافة الشاشة — لا يُقصّ عندها إلا هامش الصورة الشفّاف.
      clipBehavior: Clip.hardEdge,
      decoration: const BoxDecoration(),
      child: Stack(
        // الرسم يتجاوز حدّ الحشوة بهامشه الشفّاف؛ القصّ للحاوية وحدها.
        clipBehavior: Clip.none,
        children: [
          PositionedDirectional(
            top: 60,
            // أقرب إلى الحافة اليسرى (2026-09-28). `-18` (حشوة الحاوية) كان
            // يُلصق **صندوق** الصورة بالحافة، لكن الصورة 16 تحمل على يسارها
            // هامشاً شفّافاً (≈٢٧ بكسل بعرض ١٣٢)، فتبدأ الشخصية نفسها بعيداً
            // عن الحافة — و`Stack` كان يقصّ عند الحشوة (١٨). الآن يتدلّى
            // الصندوق خلف الحافة بـ[_productArtOverhang] من هامشه الشفّاف
            // وحده، فتقف الشخصية على بعد بكسلات من الحافة دون أن يُقصّ منها
            // شيء. يحرسه `test/character_art_placement_test.dart` بقياس
            // بكسلات الصورة الفعلية: صورةٌ بديلة بهامشٍ أضيق تُفشله قبل أن
            // تُقصّ عند الزبون.
            end: -18 - _productArtOverhang - _productArtShiftLeft,
            child: IgnorePointer(
              // بلا شفافية — الشخصية كما صورتها (قرار 2026-09-15).
              child: const CharacterArtwork(
                slot: VisualSlots.productDetail,
                width: 132,
              ),
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // القسم + الاسم + شارة التقييم.
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (product.categoryName != null)
                          Text(
                            product.categoryName!,
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontSize: 11.5,
                              fontWeight: AppDimens.weightBold,
                              letterSpacing: 0.5,
                              color: AppColors.secondary,
                            ),
                          ),
                        const SizedBox(height: 8),
                        Text(
                          localizedProductName(product, context.language),
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontFamily: 'Tajawal',
                            fontWeight: AppDimens.weightBlack,
                            fontSize: 22,
                            height: 1.35,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (product.rating != null) ...[
                    const SizedBox(width: 12),
                    OtakuPanel(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 7,
                      ),
                      radius: AppDimens.radiusFull,
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(
                            Icons.star_rounded,
                            size: 15,
                            color: AppColors.accent,
                          ),
                          const SizedBox(width: 5),
                          Text(
                            product.rating!.toStringAsFixed(1),
                            textDirection: TextDirection.ltr,
                            style: theme.textTheme.labelMedium?.copyWith(
                              fontSize: 12.5,
                              fontWeight: AppDimens.weightBold,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ],
              ),

              // السعر — السابق والنسبة يظهران فقط ببيانات خصم حقيقية.
              const SizedBox(height: 14),
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  Text(
                    context.strings.p('priceIqd', {'amount': product.price.toStringAsFixed(0)}),
                    textDirection: TextDirection.ltr,
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontFamily: 'Tajawal',
                      fontWeight: AppDimens.weightBlack,
                      fontSize: 25,
                      height: 1.2,
                      color: AppColors.secondary,
                    ),
                  ),
                  if (product.hasDiscount) ...[
                    const SizedBox(width: 11),
                    Text(
                      product.previousPrice!.toStringAsFixed(0),
                      textDirection: TextDirection.ltr,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontSize: 14,
                        decoration: TextDecoration.lineThrough,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 9),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        gradient: AppColors.primaryGradient,
                        borderRadius: BorderRadius.circular(
                          AppDimens.radiusFull,
                        ),
                      ),
                      child: Text(
                        context.strings.p('discountPercentBadge', {'percent': '${product.discountPercent}'}),
                        style: theme.textTheme.labelSmall?.copyWith(
                          fontSize: 10.5,
                          fontWeight: AppDimens.weightExtraBold,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ],
                ],
              ),

              const SizedBox(height: 14),
              ProductStockPill.forProduct(product),

              // الموعد المتوقَّع — يُعرض مع حالة «قريباً يتوفر» وحدها.
              //
              // [CRITICAL] المصدر `displayRestockAt` لا `restockAt`: المنتج
              // الذي وصلت بضاعته قبل موعده يبقى في القاعدة حاملاً تاريخاً،
              // وعرضُه على منتجٍ يمكن شراؤه الآن يناقض زرّ «أضف إلى السلة»
              // فوقه مباشرة.
              if (product.displayRestockAt != null) ...[
                const SizedBox(height: 9),
                Row(
                  children: [
                    Icon(
                      Icons.event_available_outlined,
                      size: 14,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        context.strings.p('expectedRestockOn', {
                          'date': formatShortArabicDate(
                            context,
                            product.displayRestockAt!,
                          ),
                        }),
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 12,
                          fontWeight: AppDimens.weightBold,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ],

              // ترويج التوصيل — يضبطه المسؤول على المنتج.
              if (product.hasDeliveryPromo) ...[
                const SizedBox(height: 9),
                Row(
                  children: [
                    const Text('🚚', style: TextStyle(fontSize: 13)),
                    const SizedBox(width: 6),
                    Text(
                      context.strings('deliveryPromoProduct'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12,
                        fontWeight: AppDimens.weightBold,
                        color: context.themeColors.successText,
                      ),
                    ),
                  ],
                ),
              ],

              _divider(),

              // الوصف.
              Text(context.strings('description'), style: _sectionStyle(theme)),
              const SizedBox(height: 9),
              Builder(
                builder: (context) {
                  final description = localizedProductDescription(
                    product,
                    context.language,
                  );
                  return Text(
                    description.trim().isEmpty
                        ? context.strings('noDescriptionYet')
                        : description,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 14,
                      height: 1.9,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  );
                },
              ),
              // [CRITICAL] كرديةٌ ناقصة (منتج قديم) تُعلَن لا تُخفى: العربي
              // يُعرض لأنه المتاح، لا لأنه «الكردية».
              if (product.names.isFallbackIn(context.language) ||
                  product.descriptions.isFallbackIn(context.language)) ...[
                const SizedBox(height: 10),
                const _KurdishMissingNote(),
              ],

              // الخيارات.
              if (product.options != null && product.options!.isNotEmpty) ...[
                const SizedBox(height: 22),
                Text(context.strings('availableOptions'), style: _sectionStyle(theme)),
                const SizedBox(height: 11),
                for (final option in product.options!) ...[
                  _OptionGroup(
                    option: option,
                    value: _selectedOptions[option.name],
                    onChanged: (v) =>
                        setState(() => _selectedOptions[option.name] = v),
                  ),
                  const SizedBox(height: 12),
                ],
              ],

              // الكمية.
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(child: Text(context.strings('quantity'), style: _sectionStyle(theme))),
                  // الكمية لا تظهر للزبون إلا عند انخفاض المخزون.
                  if (product.lowStock) ...[
                    Text(
                      context.strings.p('availableStockCount', {'count': '${product.stock}'}),
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 11.5,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(width: 10),
                  ],
                  OtakuQuantityStepper(
                    quantity: _quantity,
                    canIncrease: _quantity < product.stock,
                    onIncrease: () => setState(() => _quantity++),
                    onDecrease: () {
                      if (_quantity > 1) setState(() => _quantity--);
                    },
                  ),
                ],
              ),

              // أضف إلى مجموعتك.
              const SizedBox(height: 20),
              _AddToCollectionTile(productId: product.id),

              // الدفع عند الاستلام.
              const SizedBox(height: 11),
              OtakuPanel(
                elevated: false,
                color: theme.colorScheme.surfaceContainerHighest,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 15,
                ),
                child: Row(
                  children: [
                    Container(
                      width: 34,
                      height: 34,
                      decoration: BoxDecoration(
                        color: AppColors.success.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.check_rounded,
                        size: 17,
                        color: AppColors.success,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            context.strings('cashOnDelivery'),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 13,
                              fontWeight: AppDimens.weightBold,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            context.strings('cashOnDeliveryNote'),
                            style: theme.textTheme.bodySmall?.copyWith(
                              fontSize: 11.5,
                              height: 1.6,
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),

              _divider(),

              // التقييمات وصور العملاء.
              ProductReviewsSection(productId: product.id),
              const SizedBox(height: 14),
              if (missingOption)
                Text(
                  context.g(GenderedStrings.chooseAllOptions),
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  TextStyle? _sectionStyle(ThemeData theme) =>
      theme.textTheme.titleMedium?.copyWith(
        fontFamily: 'Tajawal',
        fontWeight: AppDimens.weightExtraBold,
        fontSize: 15.5,
      );

  Widget _divider() => Container(
    height: 1,
    margin: const EdgeInsets.fromLTRB(0, 22, 0, 18),
    color: Theme.of(context).colorScheme.outlineVariant,
  );

  /// شريط الإجراء السفلي — زرّ إضافة عريض مع رسم شخصية خلفه.
  Widget _buildBottomBar(Product product) {
    final theme = Theme.of(context);
    final missingOption =
        product.options != null &&
        product.options!.isNotEmpty &&
        _selectedOptions.length < product.options!.length;

    return Container(
      decoration: BoxDecoration(
        border: Border(
          top: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 14, 18, 14),
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              PositionedDirectional(
                bottom: 42,
                end: 16,
                child: IgnorePointer(
                  child: const CharacterArtwork(
                    slot: VisualSlots.productDetailReviews,
                    width: 82,
                  ),
                ),
              ),
              // نفاد المخزون لم يعد طريقاً مسدوداً: كان الزرّ يقول «نفدت
              // الكمية» ولا يفعل شيئاً، فيغادر الزبون بلا بديل. الآن يأخذ
              // مكانه إجراءٌ حقيقي — ينتظر ويُعلَم عند العودة.
              if (!product.inStock)
                RestockNotifyButton(productId: product.id)
              else
                AnimePrimaryButton(
                  label: missingOption
                      ? context.strings('chooseOptionsFirst')
                      : context.g(GenderedStrings.addToCart),
                  onPressed: missingOption
                      ? null
                      : () => _addToCart(context, product),
                  height: AppDimens.buttonHeightXl,
                ),
            ],
          ),
        ),
      ),
    );
  }

  /// هيكل تحميل الصفحة — فتحة صورة متلألئة ثم أسطر نصية.
  Widget _buildLoadingState() {
    return ListView(
      padding: EdgeInsets.zero,
      children: const [
        OtakuSkeleton.box(height: 330, radius: 0),
        Padding(
          padding: EdgeInsets.fromLTRB(18, 20, 18, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FractionallySizedBox(
                widthFactor: 0.3,
                child: OtakuSkeleton(height: 10),
              ),
              SizedBox(height: 12),
              OtakuSkeleton(height: 18),
              SizedBox(height: 10),
              FractionallySizedBox(
                widthFactor: 0.6,
                child: OtakuSkeleton(height: 18),
              ),
              SizedBox(height: 22),
              FractionallySizedBox(
                widthFactor: 0.35,
                child: OtakuSkeleton(height: 22),
              ),
              SizedBox(height: 26),
              OtakuSkeleton(height: 10),
              SizedBox(height: 9),
              OtakuSkeleton(height: 10),
              SizedBox(height: 9),
              FractionallySizedBox(
                widthFactor: 0.7,
                child: OtakuSkeleton(height: 10),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildErrorState() {
    return SafeArea(
      child: Column(
        children: [
          OtakuScreenHeader.compact(
            title: context.strings('product'),
            onBack: () => context.router.maybePop(),
          ),
          Expanded(
            child: AnimeErrorState(
              message: context.strings('productLoadFailed'),
              onAction: () {
                setState(() => _loading = true);
                _load();
              },
            ),
          ),
        ],
      ),
    );
  }

  /// مشاركة المنتج عبر طبقة المشاركة الأصلية لنظام التشغيل (واتساب،
  /// تيليغرام، نسخ، المزيد...) — بلا شبكة مشاركة داخلية خاصة بالتطبيق.
  ///
  /// النصّ من [productShareText]: الاسم ورابط المتجر، بلا سعر. الرابط مخبّأ
  /// منذ شاشة البداية؛ إن فشل ذلك الجلب تُعاد محاولةٌ واحدة قصيرة هنا، ثم
  /// يُشارَك الاسم وحده بدل أن يتأخّر الزرّ.
  Future<void> _shareProduct(Product product) async {
    final strings = context.strings;
    final name = localizedProductName(product, context.language);
    final settings = sl<StoreSettingsRepository>();
    var storeUrl = settings.links.shareUrl;
    if (storeUrl.isEmpty) {
      storeUrl = (await settings.refresh().timeout(
        _shareUrlRefreshTimeout,
        onTimeout: () => settings.links,
      )).shareUrl;
    }
    await SharePlus.instance.share(
      ShareParams(
        text: productShareText(strings, name: name, storeUrl: storeUrl),
      ),
    );
  }

  /// إضافة إلى السلة: تبقي المستخدم في شاشة تفاصيل المنتج، وتُظهر تأكيداً
  /// خفيفاً بدل نافذة حاجزة. الزائر يُدعى لتسجيل الدخول أولاً.
  Future<void> _addToCart(BuildContext context, Product product) async {
    final added = await addToCartGuarded(
      context,
      product: product,
      quantity: _quantity,
      selectedOption: _selectedOptions.isEmpty
          ? null
          : _selectedOptions.values.join(context.strings('listSeparator')),
    );
    if (!added || !context.mounted) return;

    showAddedToCartSnack(context);
  }
}

/// إعلان أن المنتج معروضٌ بالعربية لأن كرديته ناقصة (منتج أقدم من إلزام
/// الحقول الأربعة، هجرة ٠٦٦). يظهر في الواجهة الكردية وحدها.
class _KurdishMissingNote extends StatelessWidget {
  const _KurdishMissingNote();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.translate_rounded,
          size: 15,
          color: theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            context.strings('productKurdishMissingNote'),
            style: theme.textTheme.bodySmall?.copyWith(
              fontSize: 12,
              height: 1.6,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

/// زرّ عائم فوق فتحة صورة المنتج — ٤٠×٤٠ بنصف قطر ١٤ وظلّ خفيف.
class _HeroButton extends StatelessWidget {
  const _HeroButton({
    required this.icon,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;

    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: filled ? AppColors.secondary : theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          boxShadow: colors.shadowXSoft,
        ),
        child: Icon(
          icon,
          size: 17,
          color: filled ? Colors.white : theme.colorScheme.onSurfaceVariant,
        ),
      ),
    );
  }
}

/// مجموعة خيارات منتج — عنوان الخيار ثم رقائق قيمه.
class _OptionGroup extends StatelessWidget {
  const _OptionGroup({
    required this.option,
    required this.value,
    required this.onChanged,
  });

  final ProductOption option;
  final String? value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          option.name,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
            fontSize: 12.5,
            fontWeight: AppDimens.weightBold,
            color: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 9),
        Wrap(
          spacing: 9,
          runSpacing: 9,
          children: [
            for (final v in option.values)
              AnimeChoiceChip(
                label: v,
                selected: value == v,
                onSelected: (_) => onChanged(v),
              ),
          ],
        ),
      ],
    );
  }
}

/// «أضف إلى مجموعتك» — خاصية حساب؛ الزائر يُدعى لتسجيل الدخول.
class _AddToCollectionTile extends StatelessWidget {
  const _AddToCollectionTile({required this.productId});

  final String productId;

  Future<void> _open(BuildContext context) async {
    final authenticated = await requireAuthentication(
      context,
      title: context.gNow(GenderedStrings.loginFirst),
      body: context.strings('loginRequiredForCollections'),
    );
    if (!authenticated) return;
    if (context.mounted) {
      await showAddToCollectionSheet(context, productId: productId);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return InkWell(
      onTap: () => _open(context),
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: Border.all(
            color: theme.colorScheme.outlineVariant,
            width: 1.5,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: const Icon(
                Icons.collections_bookmark_outlined,
                size: 16,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                context.strings('addToYourCollection'),
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontSize: 13.5,
                  fontWeight: AppDimens.weightBold,
                ),
              ),
            ),
            Icon(Icons.add_rounded, size: 19, color: theme.colorScheme.onSurfaceVariant),
          ],
        ),
      ),
    );
  }
}
