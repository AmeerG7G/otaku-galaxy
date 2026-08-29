import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../cubit/collections_cubit.dart';

/// ورقة «أضف إلى مجموعة» بتصميم Otaku Galaxy v2.
///
/// صفوف مجموعات عائمة مع زرّ إضافة/إزالة كبسولي، ولوحة إنشاء بحقل واحد
/// داخل الورقة نفسها — بلا حوار مادي متداخل فوق الورقة.
Future<void> showAddToCollectionSheet(
  BuildContext context, {
  required String productId,
}) {
  return showOtakuSheet<void>(
    context: context,
    builder: (_) => _AddToCollectionSheet(productId: productId),
  );
}

class _AddToCollectionSheet extends StatefulWidget {
  const _AddToCollectionSheet({required this.productId});

  final String productId;

  @override
  State<_AddToCollectionSheet> createState() => _AddToCollectionSheetState();
}

class _AddToCollectionSheetState extends State<_AddToCollectionSheet> {
  final _nameController = TextEditingController();
  bool _creating = false;

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

  Future<void> _createNew() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) return;
    _nameController.clear();
    FocusScope.of(context).unfocus();
    await context.read<CollectionsCubit>().create(name);
    if (mounted) setState(() => _creating = false);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: OtakuSheet(
        title: 'إضافة إلى مجموعة',
        titleSize: 19,
        child: BlocBuilder<CollectionsCubit, CollectionsState>(
          builder: (context, state) {
            return SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (state.items.isEmpty && !_creating)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      child: Text(
                        'ما عندك مجموعات بعد — أنشئ أول مجموعة.',
                        style: theme.textTheme.bodySmall?.copyWith(
                          fontSize: 12.5,
                          height: 1.7,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    )
                  else
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 260),
                      child: ListView.separated(
                        shrinkWrap: true,
                        itemCount: state.items.length,
                        separatorBuilder: (_, _) => const SizedBox(height: 10),
                        itemBuilder: (context, index) {
                          final collection = state.items[index];
                          final inCollection = collection.productIds.contains(
                            widget.productId,
                          );
                          return _CollectionToggleRow(
                            name: collection.name,
                            count: collection.productIds.length,
                            selected: inCollection,
                            onTap: () {
                              final cubit = context.read<CollectionsCubit>();
                              if (inCollection) {
                                cubit.removeProduct(
                                  collection.id,
                                  widget.productId,
                                );
                              } else {
                                cubit.addProduct(
                                  collection.id,
                                  widget.productId,
                                );
                              }
                            },
                          );
                        },
                      ),
                    ),

                  const SizedBox(height: 14),

                  // إنشاء مجموعة جديدة داخل الورقة نفسها.
                  if (_creating) ...[
                    AnimeTextField(
                      controller: _nameController,
                      hint: 'اسم المجموعة',
                      onSubmitted: (_) => _createNew(),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: AnimeOutlinedButton(
                            label: 'إلغاء',
                            onPressed: () => setState(() => _creating = false),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: AnimePrimaryButton(
                            label: 'إنشاء',
                            onPressed: _createNew,
                          ),
                        ),
                      ],
                    ),
                  ] else
                    AnimeOutlinedButton(
                      label: 'مجموعة جديدة',
                      onPressed: () => setState(() => _creating = true),
                      icon: Icons.add,
                      iconPosition: IconPosition.start,
                    ),

                  const SizedBox(height: 12),
                  Center(
                    child: Text(
                      'مجموعاتك خاصة فيك ولا تظهر لأحد.',
                      style: theme.textTheme.labelSmall?.copyWith(
                        fontSize: 11.5,
                        color: theme.colorScheme.outline,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// صفّ مجموعة داخل ورقة الإضافة — اسم وعدد وزرّ حالة كبسولي.
class _CollectionToggleRow extends StatelessWidget {
  const _CollectionToggleRow({
    required this.name,
    required this.count,
    required this.selected,
    required this.onTap,
  });

  final String name;
  final int count;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return OtakuPanel(
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      borderColor: selected
          ? AppColors.secondary.withValues(alpha: 0.4)
          : theme.colorScheme.outlineVariant,
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '$count منتج',
                  style: theme.textTheme.labelSmall?.copyWith(
                    fontSize: 11,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              gradient: selected ? null : AppColors.primaryGradient,
              color: selected
                  ? theme.colorScheme.surfaceContainerHighest
                  : null,
              borderRadius: BorderRadius.circular(AppDimens.radiusFull),
              border: selected
                  ? Border.all(color: theme.colorScheme.outlineVariant)
                  : null,
            ),
            child: Text(
              selected ? 'إزالة' : 'إضافة',
              style: theme.textTheme.labelSmall?.copyWith(
                fontSize: 11.5,
                fontWeight: AppDimens.weightBold,
                color: selected
                    ? theme.colorScheme.onSurfaceVariant
                    : Colors.white,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
