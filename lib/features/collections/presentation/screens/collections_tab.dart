import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/router/app_router.dart';
import '../../domain/entities/collection.dart';
import '../cubit/collections_cubit.dart';

/// تبويب «مجموعاتي» بتصميم Otaku Galaxy v2.
///
/// صفوف مجموعات عائمة بمصغّرات متداخلة، ثم لوحة إنشاء بحافة متقطّعة
/// تحوي حقلاً وزرّاً متدرّجاً — بدل زر عائم وقوائم Material منبثقة.
class CollectionsTab extends StatefulWidget {
  const CollectionsTab({super.key});

  @override
  State<CollectionsTab> createState() => _CollectionsTabState();
}

class _CollectionsTabState extends State<CollectionsTab> {
  final _nameController = TextEditingController();

  @override
  void initState() {
    super.initState();
    context.read<CollectionsCubit>().load();
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _createCollection() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    _nameController.clear();
    FocusScope.of(context).unfocus();
    await context.read<CollectionsCubit>().create(name);
  }

  Future<void> _renameCollection(Collection collection) async {
    final controller = TextEditingController(text: collection.name);
    final name = await showOtakuSheet<String>(
      context: context,
      builder: (sheetContext) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(sheetContext).viewInsets.bottom,
        ),
        child: OtakuSheet(
          title: 'إعادة تسمية المجموعة',
          titleSize: 19,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AnimeTextField(
                controller: controller,
                label: 'اسم المجموعة',
                hint: 'مثلاً: أريد شراءها لاحقاً',
                prefixIcon: Icons.collections_bookmark_outlined,
              ),
              const SizedBox(height: 20),
              AnimePrimaryButton(
                label: 'حفظ',
                onPressed: () =>
                    Navigator.of(sheetContext).pop(controller.text),
              ),
            ],
          ),
        ),
      ),
    );
    if (name == null || name.trim().isEmpty || !mounted) return;
    await context.read<CollectionsCubit>().rename(collection.id, name.trim());
  }

  Future<void> _deleteCollection(Collection collection) async {
    final confirmed = await showOtakuConfirm(
      context: context,
      title: 'حذف المجموعة',
      message:
          'راح نحذف «${collection.name}». المنتجات نفسها راح تبقى بمفضلتك.',
      confirmLabel: 'حذف',
      cancelLabel: 'إلغاء',
      destructive: true,
    );
    if (confirmed != true || !mounted) return;
    await context.read<CollectionsCubit>().delete(collection.id);
  }

  /// ورقة إجراءات المجموعة — بديل `PopupMenuButton` المادي.
  Future<void> _openActions(Collection collection) async {
    final action = await showOtakuPicker<String>(
      context: context,
      title: collection.name,
      options: const [
        OtakuPickerOption(value: 'rename', label: 'إعادة تسمية'),
        OtakuPickerOption(value: 'delete', label: 'حذف المجموعة'),
      ],
    );
    if (action == 'rename') await _renameCollection(collection);
    if (action == 'delete') await _deleteCollection(collection);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return BlocBuilder<CollectionsCubit, CollectionsState>(
      builder: (context, state) {
        if (state.loading && state.items.isEmpty) {
          return const OtakuListSkeleton(count: 3, height: 78);
        }
        if (state.error != null && state.items.isEmpty) {
          return AnimeErrorState(
            message: state.error!,
            onAction: () => context.read<CollectionsCubit>().load(),
          );
        }

        return ListView(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 104),
          children: [
            if (state.items.isEmpty)
              const OtakuEditorialPanel(
                title: 'أنشئ مجموعتك الأولى',
                body:
                    'جمّع منتجاتك بمجموعات مثل «أشياء أريدها» أو «للدراسة» '
                    'حتى تلكيها بسرعة.',
                artwork: 'assets/art/opt/a-luffy-kid.png',
                margin: EdgeInsets.zero,
                minHeight: 200,
                artHeight: 150,
                contentWidthFactor: 0.66,
              )
            else
              for (final collection in state.items) ...[
                _CollectionRow(
                  collection: collection,
                  onOpen: () => context.router.push(
                    CollectionDetailRoute(
                      collectionId: collection.id,
                      collectionName: collection.name,
                    ),
                  ),
                  onActions: () => _openActions(collection),
                ),
                const SizedBox(height: 12),
              ],

            // لوحة إنشاء مجموعة جديدة — حافة متقطّعة كما في مصدر التصميم.
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(AppDimens.radiusMd),
                border: Border.all(
                  color: theme.colorScheme.outlineVariant,
                  width: 1.5,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'مجموعة جديدة',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontFamily: 'Tajawal',
                      fontWeight: AppDimens.weightExtraBold,
                      fontSize: 15,
                    ),
                  ),
                  const SizedBox(height: 12),
                  AnimeTextField(
                    controller: _nameController,
                    hint: 'اسم المجموعة',
                    onSubmitted: (_) => _createCollection(),
                  ),
                  const SizedBox(height: 12),
                  AnimePrimaryButton(
                    label: 'إنشاء',
                    onPressed: _createCollection,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 13),
            Text(
              'مجموعاتك خاصة بك ولا يراها أحد غيرك.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodySmall?.copyWith(
                fontSize: 11.5,
                color: theme.colorScheme.outline,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// صفّ مجموعة — مصغّرات متداخلة، اسم، عدد المنتجات، وزرّ إجراءات.
class _CollectionRow extends StatelessWidget {
  const _CollectionRow({
    required this.collection,
    required this.onOpen,
    required this.onActions,
  });

  final Collection collection;
  final VoidCallback onOpen;
  final VoidCallback onActions;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final thumbCount = collection.productIds.take(3).length;

    return OtakuPanel(
      onTap: onOpen,
      padding: const EdgeInsets.all(14),
      child: Row(
        children: [
          // مصغّرات محايدة — فتحات صور فارغة حتى تتوفّر صور المنتجات.
          SizedBox(
            width: thumbCount == 0 ? 44 : 44 + (thumbCount - 1) * 18.0,
            height: 44,
            child: thumbCount == 0
                ? Container(
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(AppDimens.radiusXs),
                      border: Border.all(
                        color: theme.colorScheme.outlineVariant,
                      ),
                    ),
                    child: Icon(
                      Icons.collections_bookmark_outlined,
                      size: 18,
                      color: theme.colorScheme.outline,
                    ),
                  )
                : Stack(
                    children: [
                      for (var i = 0; i < thumbCount; i++)
                        PositionedDirectional(
                          start: i * 18.0,
                          child: Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(
                                AppDimens.radiusXs,
                              ),
                              border: Border.all(
                                color: theme.colorScheme.surface,
                                width: 2,
                              ),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: const ProductPhotoSlot(
                              showLabel: false,
                              iconSize: 15,
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  collection.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 14,
                    height: 1.4,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  '${collection.productIds.length} منتج',
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11.5,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          InkWell(
            onTap: onActions,
            customBorder: const CircleBorder(),
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(
                Icons.more_horiz_rounded,
                size: 20,
                color: theme.colorScheme.outline,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
