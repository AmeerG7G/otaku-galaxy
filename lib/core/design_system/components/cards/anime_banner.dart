import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';
import '../../tokens/app_theme_colors.dart';

class AnimeBanner extends StatelessWidget {
  const AnimeBanner({
    super.key,
    this.imageUrl,
    this.title,
    this.subtitle,
    this.onTap,
    this.height = AppDimens.bannerHeight,
    this.gradient,
    this.child,
  });

  final String? imageUrl;
  final String? title;
  final String? subtitle;
  final VoidCallback? onTap;
  final double height;
  final LinearGradient? gradient;
  final Widget? child;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final effectiveGradient = gradient ?? colors.bannerGradient;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: height,
        margin: EdgeInsets.symmetric(
          horizontal: AppDimens.screenHorizontalPadding,
        ),
        decoration: BoxDecoration(
          gradient: effectiveGradient,
          borderRadius: BorderRadius.circular(AppDimens.bannerBorderRadius),
          boxShadow: [
            BoxShadow(
              color: colors.glowPrimary.withValues(alpha: 0.3),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Stack(
          children: [
            if (imageUrl != null)
              ClipRRect(
                borderRadius: BorderRadius.circular(
                  AppDimens.bannerBorderRadius,
                ),
                child: Image.network(
                  imageUrl!,
                  width: double.infinity,
                  height: double.infinity,
                  fit: BoxFit.cover,
                  color: Colors.black.withValues(alpha: 0.3),
                  colorBlendMode: BlendMode.darken,
                ),
              ),
            if (child != null)
              Center(child: child!)
            else if (title != null || subtitle != null)
              Padding(
                padding: EdgeInsets.all(AppDimens.space6),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (title != null)
                      Text(
                        title!,
                        style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          color: Colors.white,
                          fontWeight: AppDimens.weightBold,
                          shadows: [
                            Shadow(
                              color: Colors.black.withValues(alpha: 0.3),
                              blurRadius: 4,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                      ),
                    if (subtitle != null) ...[
                      SizedBox(height: AppDimens.space2),
                      Text(
                        subtitle!,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: Colors.white.withValues(alpha: 0.9),
                          shadows: [
                            Shadow(
                              color: Colors.black.withValues(alpha: 0.3),
                              blurRadius: 4,
                              offset: const Offset(0, 2),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            // عناصر زخرفية أنمي
            Positioned(
              top: -AppDimens.space5,
              right: -AppDimens.space5,
              child: Opacity(
                opacity: 0.1,
                child: Icon(
                  Icons.star,
                  size: AppDimens.iconHero * 2,
                  color: Colors.white,
                ),
              ),
            ),
            Positioned(
              bottom: -AppDimens.space5,
              left: -AppDimens.space5,
              child: Opacity(
                opacity: 0.1,
                child: Icon(
                  Icons.auto_awesome,
                  size: AppDimens.iconHero * 2,
                  color: Colors.white,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// مقسم بتصميم أنمي
