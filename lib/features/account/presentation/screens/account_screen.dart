import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../../core/design_system/design_system.dart';
import '../../../../core/di/injection_container.dart';
import '../../../../core/errors/app_exception.dart';
import '../../../../core/router/app_router.dart';
import '../../../auth/presentation/cubit/auth_cubit.dart';
import '../../../auth/presentation/cubit/auth_state.dart';
import '../../../birthday/data/birthday_storage.dart';
import '../../../birthday/presentation/birthday_prompt.dart';
import '../../../favorites/presentation/cubit/favorites_cubit.dart';
import '../../../favorites/presentation/cubit/favorites_state.dart';
import '../../../points/domain/entities/otaku_level.dart';
import '../../../points/presentation/cubit/points_cubit.dart';
import '../../../settings/data/store_settings_repository.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../../core/network/api_client.dart';
import '../../../../core/constants/api_endpoints.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter/foundation.dart';

/// تبويب الحساب بتصميم Otaku Galaxy v2.
///
/// بطاقة ملف شخصي متدرّجة واحدة تجمع الصورة والاسم والمستوى ونقاط
/// المجرّة وشريط التقدّم، ثم صفوف إعدادات عائمة مستقلة، ثم قسم التواصل.
/// الزائر يرى بطاقة دعوة متدرّجة برسم شخصية بدل رسالة نصية.
@RoutePage()
class AccountScreen extends StatelessWidget {
  const AccountScreen({super.key});

  /// مؤشّر رفع الصورة الشخصية — تقرأه بطاقة الملف لعرض حالة الرفع.
  static final ValueNotifier<bool> _avatarUploading = ValueNotifier(false);

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthCubit, AuthState>(
      builder: (context, state) {
        final user = switch (state) {
          AuthAuthenticated(:final user) => user,
          _ => null,
        };

        // الشريط السفلي عائم فوق المحتوى، فنترك له مساحة أسفل القائمة.
        return SafeArea(
          bottom: false,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 104),
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(18, 20, 18, 0),
                child: user == null
                    ? _GuestCard(
                        onLogin: () => context.router.push(const LoginRoute()),
                      )
                    : _ProfileCard(
                        name: user.username,
                        avatarUrl: user.avatarUrl,
                        onOpenPoints: () =>
                            context.router.push(const GalaxyPointsRoute()),
                        onEditAvatar: () => _editAvatar(context),
                      ),
              ),
              // خيار الميلاد وبطاقة التأكيد يتبعان حالة الخادم مباشرة.
              ValueListenableBuilder<int>(
                valueListenable: sl<BirthdayStorage>().revision,
                builder: (context, _, _) => Column(
                  children: [
                    _buildRows(context, isMember: user != null),
                    if (sl<BirthdayStorage>().hasBirthday)
                      _buildBirthdaySaved(context),
                  ],
                ),
              ),
              _buildSocials(context),
              if (user != null)
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 14, 18, 0),
                  child: _LogoutButton(onTap: () => _confirmLogout(context)),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildRows(BuildContext context, {required bool isMember}) {
    final birthday = sl<BirthdayStorage>();
    final showBirthday =
        isMember && birthday.isUnlocked && !birthday.hasBirthday;

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 20, 18, 0),
      child: Column(
        children: [
          // ترتيب المرجع: طلباتي ثم المفضلة، ثم عيد الميلاد والإعدادات.
          // الصفوف التي تفتح شاشات محمية تظهر للأعضاء فقط — عرضها للزائر
          // كان يقذفه لشاشة الدخول عند كل نقرة.
          if (isMember) ...[
            OtakuSettingRow(
              icon: Icons.receipt_long_outlined,
              iconColor: AppColors.primary,
              label: 'طلباتي',
              onTap: () => context.router.push(const OrdersRoute()),
            ),
            const SizedBox(height: 10),
          ],
          BlocBuilder<FavoritesCubit, FavoritesState>(
            builder: (context, favorites) => OtakuSettingRow(
              icon: Icons.favorite_outline,
              iconColor: AppColors.secondary,
              label: 'المفضلة',
              // العدد حقيقي من حالة المفضلة المحمّلة أصلاً — بلا نداء إضافي.
              value: favorites.products.isEmpty
                  ? null
                  : '${favorites.products.length}',
              onTap: () => context.router.push(const FavoritesRoute()),
            ),
          ),
          // عيد الميلاد — يظهر فقط بعد استلام أول طلب، ويختفي بعد الحفظ.
          if (showBirthday) ...[
            const SizedBox(height: 10),
            OtakuSettingRow(
              icon: Icons.cake_outlined,
              iconColor: AppColors.accent,
              label: 'إضافة تاريخ الميلاد',
              onTap: () => _addBirthday(context),
            ),
          ],
          if (isMember) ...[
            const SizedBox(height: 10),
            OtakuSettingRow(
              icon: Icons.settings_outlined,
              iconColor: AppColors.accentCyan,
              label: 'الإعدادات',
              onTap: () => context.router.push(const SettingsRoute()),
            ),
          ],
          const SizedBox(height: 10),
          OtakuSettingRow(
            icon: Icons.info_outline,
            iconColor: AppColors.success,
            label: 'حول التطبيق',
            value: 'إصدار 1.0.0',
            showChevron: false,
            // صفّ عرض فقط — بلا onTap حتى لا يعطي تموّجاً يوحي بوجهة.
          ),
        ],
      ),
    );
  }

  /// بطاقة تأكيد حفظ تاريخ الميلاد — لمسة خضراء هادئة.
  Widget _buildBirthdaySaved(BuildContext context) {
    final theme = Theme.of(context);
    final birthday = sl<BirthdayStorage>();

    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 16, 18, 0),
      child: OtakuPanel(
        elevated: false,
        color: Color.alphaBlend(
          AppColors.success.withValues(alpha: 0.08),
          theme.colorScheme.surface,
        ),
        borderColor: AppColors.success.withValues(alpha: 0.24),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Container(
              width: 34,
              height: 34,
              decoration: BoxDecoration(
                color: AppColors.success.withValues(alpha: 0.16),
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
                children: [
                  Text(
                    '🎂 تاريخ ميلادك محفوظ — '
                    '${birthday.day}/${birthday.month}',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontSize: 13,
                      fontWeight: AppDimens.weightBold,
                    ),
                  ),
                  const SizedBox(height: 3),
                  Text(
                    'خصم ${birthday.discountPercent}٪ على طلب واحد بيوم '
                    'ميلادك.',
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
    );
  }

  /// روابط التواصل — صفوف عائمة بعنوان مجموعة، لا شبكة أيقونات دائرية.
  /// الروابط يضبطها المسؤول من لوحة التحكم؛ الفارغ منها يبقى بسلوك آمن.
  Widget _buildSocials(BuildContext context) {
    final links = sl<StoreSettingsRepository>().links;
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 26, 18, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const OtakuGroupLabel(
            label: 'تابعنا وتواصل معنا',
            padding: EdgeInsets.only(bottom: 12),
          ),
          _SocialRow(
            icon: Icons.music_note_rounded,
            name: 'تيك توك',
            subtitle: 'جديد المنتجات والعروض',
            tint: const Color(0xFF1C1B22),
            url: links.tiktok,
          ),
          const SizedBox(height: 10),
          _SocialRow(
            icon: Icons.camera_alt_outlined,
            name: 'إنستغرام',
            subtitle: 'صور المنتجات ولقطات المتجر',
            tint: const Color(0xFFE1306C),
            url: links.instagram,
          ),
          const SizedBox(height: 10),
          _SocialRow(
            icon: Icons.chat_bubble_outline,
            name: 'واتساب',
            subtitle: 'تواصل مباشر مع خدمة العملاء',
            tint: const Color(0xFF25D366),
            url: links.whatsapp,
          ),
        ],
      ),
    );
  }

  /// إضافة تاريخ الميلاد — تعيد استخدام ورقة الميلاد المشتركة.
  Future<void> _addBirthday(BuildContext context) async {
    final saved = await showBirthdayPrompt(context);
    if (!saved || !context.mounted) return;
    _snack(context, 'تاريخ ميلادك محفوظ 🎂', success: true);
  }

  /// تغيير الصورة الشخصية: اختيار من معرض الجهاز، رفع عبر نقطة الوسائط
  /// الحقيقية، ثم حفظ الرابط العائد في ملف المستخدم على الخادم.
  ///
  /// الالتقاط بالكاميرا مُزال عمداً — الاختيار من المعرض فقط.
  Future<void> _editAvatar(BuildContext context) async {
    final auth = context.read<AuthCubit>();
    final hasAvatar = (auth.user?.avatarUrl ?? '').trim().isNotEmpty;

    final action = await showOtakuPicker<String>(
      context: context,
      title: 'الصورة الشخصية',
      options: [
        const OtakuPickerOption(value: 'gallery', label: 'اختيار من المعرض'),
        if (hasAvatar)
          const OtakuPickerOption(value: 'remove', label: 'إزالة الصورة'),
      ],
    );
    if (action == null || !context.mounted) return;

    if (action == 'remove') {
      await _applyAvatar(context, null);
      return;
    }

    final picked = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (picked == null || !context.mounted) return;

    _avatarUploading.value = true;
    try {
      final data = await sl<ApiClient>().uploadFile(
        ApiEndpoints.uploads,
        filePath: picked.path,
        purpose: 'avatar',
      );
      final url = (data as Map<String, dynamic>)['url'] as String?;
      if (!context.mounted) return;
      await _applyAvatar(context, url);
    } catch (e) {
      if (!context.mounted) return;
      _snack(context, _uploadError(e), success: false);
    } finally {
      _avatarUploading.value = false;
    }
  }

  /// يحفظ الرابط (أو يمسحه) في ملف المستخدم عبر الـAPI الحقيقي.
  Future<void> _applyAvatar(BuildContext context, String? url) async {
    final auth = context.read<AuthCubit>();
    try {
      await auth.updateProfile(avatar: url, clearAvatar: url == null);
      if (!context.mounted) return;
      _snack(
        context,
        url == null ? 'أُزيلت الصورة الشخصية' : 'تم تحديث الصورة الشخصية',
        success: true,
      );
    } catch (e) {
      if (!context.mounted) return;
      _snack(context, _uploadError(e), success: false);
    }
  }

  String _uploadError(Object e) =>
      e is AppException && e.message.trim().isNotEmpty
      ? e.message
      : 'تعذّر رفع الصورة، تأكد من اتصالك وحاول مرة أخرى';

  Future<void> _confirmLogout(BuildContext context) async {
    final auth = context.read<AuthCubit>();
    final confirmed = await showOtakuConfirm(
      context: context,
      title: 'تسجيل الخروج',
      message: 'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
      confirmLabel: 'تسجيل الخروج',
      cancelLabel: 'إلغاء',
      destructive: true,
    );
    if (confirmed != true) return;
    await auth.logout();
    if (context.mounted) {
      context.router.replace(const LoginRoute());
    }
  }

  void _snack(BuildContext context, String message, {required bool success}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          backgroundColor: success
              ? context.themeColors.success
              : context.themeColors.error,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppDimens.radiusLg),
          ),
          margin: const EdgeInsets.all(18),
        ),
      );
  }
}

/// بطاقة دعوة الزائر — تدرّج بنفسجي‑وردي ورسم شخصية يخرج من الحافة.
class _GuestCard extends StatelessWidget {
  const _GuestCard({required this.onLogin});

  final VoidCallback onLogin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF7C5CFF), Color(0xFFFF3D8F)],
          begin: Alignment.topRight,
          end: Alignment.bottomLeft,
        ),
        borderRadius: BorderRadius.circular(AppDimens.radiusXl),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.28),
            blurRadius: 38,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          PositionedDirectional(
            bottom: -10,
            end: -16,
            child: IgnorePointer(
              child: Image.asset('assets/art/opt/a-i0.png', height: 175),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 26),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'أنت تتصفح كزائر',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleLarge?.copyWith(
                    fontFamily: 'Tajawal',
                    fontWeight: AppDimens.weightBlack,
                    fontSize: 19,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'سجّل الدخول لتتابع طلباتك وتحفظ مفضلتك ومجموعاتك.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 12.5,
                    height: 1.7,
                    color: Colors.white.withValues(alpha: 0.88),
                  ),
                ),
                const SizedBox(height: 14),
                InkWell(
                  onTap: onLogin,
                  borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 20,
                      vertical: 11,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                    ),
                    child: Text(
                      'تسجيل الدخول',
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontSize: 12.5,
                        fontWeight: AppDimens.weightExtraBold,
                        color: const Color(0xFF26134A),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// بطاقة الملف الشخصي — الصورة والاسم والمستوى ونقاط المجرّة في سطح واحد.
class _ProfileCard extends StatefulWidget {
  const _ProfileCard({
    required this.name,
    required this.avatarUrl,
    required this.onOpenPoints,
    required this.onEditAvatar,
  });

  final String? name;
  final String? avatarUrl;
  final VoidCallback onOpenPoints;
  final VoidCallback onEditAvatar;

  @override
  State<_ProfileCard> createState() => _ProfileCardState();
}

class _ProfileCardState extends State<_ProfileCard> {
  @override
  void initState() {
    super.initState();
    // نقاط ورصيد وحالة ميلاد حقيقية عند كل فتح للحساب.
    context.read<PointsCubit>().load();
    sl<BirthdayStorage>().refresh();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isRtl = Directionality.of(context) == TextDirection.rtl;

    return BlocBuilder<PointsCubit, PointsState>(
      builder: (context, state) {
        final level = OtakuLevel.forPoints(state.balance);
        final progress = level.progress(state.balance);
        final remaining = level.pointsToNext(state.balance);

        return InkWell(
          onTap: widget.onOpenPoints,
          borderRadius: BorderRadius.circular(AppDimens.radiusXl),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFFFF3D8F), Color(0xFF7C5CFF)],
                begin: Alignment.topRight,
                end: Alignment.bottomLeft,
              ),
              borderRadius: BorderRadius.circular(AppDimens.radiusXl),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withValues(alpha: 0.30),
                  blurRadius: 38,
                  offset: const Offset(0, 18),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Stack(
              children: [
                PositionedDirectional(
                  top: -44,
                  start: -28,
                  child: Container(
                    width: 164,
                    height: 164,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.13),
                    ),
                  ),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        _Avatar(
                          url: widget.avatarUrl,
                          onEdit: widget.onEditAvatar,
                          uploading: AccountScreen._avatarUploading,
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                widget.name?.trim().isNotEmpty == true
                                    ? widget.name!
                                    : 'اسم المستخدم',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleLarge?.copyWith(
                                  fontFamily: 'Tajawal',
                                  fontWeight: AppDimens.weightExtraBold,
                                  fontSize: 19,
                                  color: Colors.white,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                'المستوى ${level.number} — ${level.title}',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium?.copyWith(
                                  fontSize: 13,
                                  fontWeight: AppDimens.weightBold,
                                  color: Colors.white.withValues(alpha: 0.92),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          width: 32,
                          height: 32,
                          decoration: BoxDecoration(
                            color: Colors.white.withValues(alpha: 0.20),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(
                            isRtl
                                ? Icons.arrow_back_ios_new_rounded
                                : Icons.arrow_forward_ios_rounded,
                            size: 13,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 19),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Expanded(
                          child: Text(
                            '🌌 نقاط المجرّة',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              fontSize: 13,
                              fontWeight: AppDimens.weightBold,
                              color: Colors.white.withValues(alpha: 0.92),
                            ),
                          ),
                        ),
                        Text(
                          '${state.balance}',
                          textDirection: TextDirection.ltr,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontFamily: 'Tajawal',
                            fontWeight: AppDimens.weightBlack,
                            fontSize: 30,
                            height: 1,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppDimens.radiusFull),
                      child: LinearProgressIndicator(
                        value: progress.clamp(0.0, 1.0),
                        minHeight: 8,
                        backgroundColor: Colors.black.withValues(alpha: 0.22),
                        valueColor: const AlwaysStoppedAnimation(Colors.white),
                      ),
                    ),
                    const SizedBox(height: 9),
                    Text(
                      remaining > 0
                          ? 'باقي $remaining نقطة للمستوى التالي'
                          : 'وصلت لأعلى مستوى 🎉',
                      style: theme.textTheme.bodySmall?.copyWith(
                        fontSize: 12.5,
                        fontWeight: AppDimens.weightBold,
                        color: Colors.white.withValues(alpha: 0.90),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// صورة الملف الشخصي داخل البطاقة المتدرّجة مع زرّ تغيير صغير.
class _Avatar extends StatelessWidget {
  const _Avatar({
    required this.url,
    required this.onEdit,
    required this.uploading,
  });

  final String? url;
  final VoidCallback onEdit;

  /// حالة رفع الصورة — تُغطّي الصورة بطبقة انتظار أثناء الرفع.
  final ValueListenable<bool> uploading;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<bool>(
      valueListenable: uploading,
      builder: (context, isUploading, _) => SizedBox(
        width: 64,
        height: 64,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.14),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.65),
                  width: 2,
                ),
              ),
              clipBehavior: Clip.antiAlias,
              child: url != null && url!.trim().isNotEmpty
                  ? Image.network(
                      url!,
                      fit: BoxFit.cover,
                      // الصورة تُحمَّل من الخادم — نُظهر انتظاراً هادئاً بدل قفزة.
                      loadingBuilder: (context, child, progress) =>
                          progress == null ? child : const _AvatarBusy(),
                      errorBuilder: (_, _, _) => const Icon(
                        Icons.person_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                    )
                  : const Icon(
                      Icons.person_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
            ),
            if (isUploading)
              Positioned.fill(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: const _AvatarBusy(),
                ),
              ),
            PositionedDirectional(
              bottom: -5,
              end: -5,
              child: InkWell(
                onTap: isUploading ? null : onEdit,
                customBorder: const CircleBorder(),
                child: Container(
                  width: 22,
                  height: 22,
                  decoration: BoxDecoration(
                    color: isUploading
                        ? AppColors.secondary.withValues(alpha: 0.5)
                        : AppColors.secondary,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: Theme.of(context).colorScheme.surface,
                      width: 2,
                    ),
                  ),
                  child: const Icon(Icons.add, size: 13, color: Colors.white),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// طبقة انتظار فوق الصورة الشخصية بلغة v2 (زجاج داكن + مؤشّر أبيض رفيع).
class _AvatarBusy extends StatelessWidget {
  const _AvatarBusy();

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: Colors.black.withValues(alpha: 0.38),
      child: const Center(
        child: SizedBox(
          width: 20,
          height: 20,
          child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
        ),
      ),
    );
  }
}

/// صفّ قناة تواصل — أيقونة ملوّنة، اسم ووصف، وسهم خروج مائل.
class _SocialRow extends StatelessWidget {
  const _SocialRow({
    required this.icon,
    required this.name,
    required this.subtitle,
    required this.tint,
    required this.url,
  });

  final IconData icon;
  final String name;
  final String subtitle;
  final Color tint;
  final String url;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return OtakuPanel(
      onTap: () => _onTap(context),
      padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
      child: Row(
        children: [
          Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: tint.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(icon, size: 17, color: tint),
          ),
          const SizedBox(width: 13),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  name,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontSize: 13.5,
                    fontWeight: AppDimens.weightBold,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: theme.textTheme.bodySmall?.copyWith(
                    fontSize: 11,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),
          Icon(
            Icons.north_east_rounded,
            size: 16,
            color: theme.colorScheme.outline,
          ),
        ],
      ),
    );
  }

  /// يفتح الرابط المضبوط من لوحة التحكم. الرابط غير المضبوط يبقى بسلوكه
  /// الآمن: رسالة واضحة بدل فتح رابط معطّل.
  Future<void> _onTap(BuildContext context) async {
    final value = url.trim();
    if (value.isEmpty) {
      _notify(context, 'الرابط يُضاف لاحقاً');
      return;
    }

    // رقم واتساب مجرّد يُحوَّل إلى رابط محادثة.
    final uri = Uri.tryParse(
      RegExp(r'^\+?\d{8,15}$').hasMatch(value)
          ? 'https://wa.me/${value.replaceAll('+', '')}'
          : value,
    );
    if (uri == null) {
      _notify(context, 'الرابط غير صالح');
      return;
    }

    final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!opened && context.mounted) {
      _notify(context, 'تعذّر فتح الرابط');
    }
  }

  void _notify(BuildContext context, String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.all(18),
        ),
      );
  }
}

/// زرّ تسجيل الخروج — سطح عائم بحبر أحمر، لا زرّ ممتلئ.
class _LogoutButton extends StatelessWidget {
  const _LogoutButton({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(AppDimens.radiusMd),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 15),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(AppDimens.radiusMd),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Text(
          'تسجيل الخروج',
          style: theme.textTheme.labelLarge?.copyWith(
            fontSize: 14,
            fontWeight: AppDimens.weightBold,
            color: AppColors.error,
          ),
        ),
      ),
    );
  }
}
