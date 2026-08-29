import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../../products/domain/entities/product.dart';
import '../../../products/domain/usecases/fetch_product_details_usecase.dart';
import '../cubit/collections_cubit.dart';

/// تفاصيل مجموعة بتصميم Otaku Galaxy v2.
///
/// ترويسة باسم المجموعة وعدد منتجاتها، ثم صفوف منتجات أفقية بفتحة صورة
/// محايدة وزرّ إزالة هادئ — لا شريط تطبيق ولا بطاقات مادية.
@RoutePage()
class CollectionDetailScreen extends StatefulWidget {
  const CollectionDetailScreen({
    super.key,
    required this.collectionId,
    required this.collectionName,
  });

  final String collectionId;
  final String collectionName;

  @override
  State<CollectionDetailScreen> createState() => _CollectionDetailScreenState();
}

class _CollectionDetailScreenState extends State<CollectionDetailScreen> {
  List<Product> _products = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  /// أسماء المنتجات تُجلب من الخادم الحقيقي عبر معرّفاتها المخزّنة محلياً —
  /// المجموعة نفسها محلية، لكن بيانات المنتج حقيقية.
  Future<void> _load() async {
    setState(() => _loading = true);
    final cubit = context.read<CollectionsCubit>();
    await cubit.load();
    if (!mounted) return;

    final collection = cubit.state.items
        .where((c) => c.id == widget.collectionId)
        .firstOrNull;
    final fetch = context.read<FetchProductDetailsUsecase>();
    final products = <Product>[];
    for (final id in collection?.productIds ?? const <String>[]) {
      try {
        products.add(await fetch(id));
      } catch (_) {
        // منتج لم يعد متاحاً — يُتجاهل بلا إفشال الشاشة.
      }
    }
    if (!mounted) return;
    setState(() {
      _products = products;
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          OtakuScreenHeader(
            title: widget.collectionName,
            subtitle: _loading
                ? 'جاري التحميل…'
                : '${_products.length} منتج في هذه المجموعة',
            onBack: () => context.router.maybePop(),
          ),
          Expanded(child: _buildBody()),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) return const OtakuListSkeleton(count: 4, height: 86);
    if (_products.isEmpty) {
      return const AnimeEmptyState(
        title: 'المجموعة فارغة',
        subtitle:
            'أضف منتجات لهذه المجموعة من صفحة المنتج عبر «أضف إلى مجموعتك».',
        artwork: 'assets/art/opt/a-i5.png',
      );
    }

    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(18, 12, 18, 26),
      itemCount: _products.length,
      separatorBuilder: (_, _) => const SizedBox(height: 11),
      itemBuilder: (context, index) {
        final product = _products[index];
        return AnimeProductRow(
          product: product,
          onTap: () =>
              context.router.push(ProductDetailRoute(productId: product.id)),
          trailing: _RemoveButton(onTap: () => _confirmRemove(product)),
        );
      },
    );
  }

  Future<void> _confirmRemove(Product product) async {
    final confirmed = await showOtakuConfirm(
      context: context,
      title: 'إزالة من المجموعة',
      message:
          'راح نشيل «${product.name}» من هذه المجموعة. المنتج نفسه راح يبقى '
          'بالمتجر ومفضلتك.',
      confirmLabel: 'إزالة',
      cancelLabel: 'إلغاء',
      destructive: true,
    );
    if (confirmed != true || !mounted) return;
    await context.read<CollectionsCubit>().removeProduct(
      widget.collectionId,
      product.id,
    );
    await _load();
  }
}

/// زرّ إزالة منتج من المجموعة — دائري هادئ بحبر أحمر.
class _RemoveButton extends StatelessWidget {
  const _RemoveButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      customBorder: const CircleBorder(),
      child: Container(
        width: 34,
        height: 34,
        decoration: BoxDecoration(
          color: AppColors.error.withValues(alpha: 0.12),
          shape: BoxShape.circle,
        ),
        child: const Icon(
          Icons.close_rounded,
          size: 16,
          color: AppColors.error,
        ),
      ),
    );
  }
}
