import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';

class OtakuStoreLogo extends StatelessWidget {
  const OtakuStoreLogo({
    super.key,
    this.size = AppDimens.iconLogo,
    this.showText = true,
    this.textSize,
    this.textColor,
    this.cupColor,
    this.steamColor,
    this.glowEnabled = true,
    this.animationDuration = AppDimens.durationSlow,
  });

  final double size;
  final bool showText;
  final double? textSize;
  final Color? textColor;
  final Color? cupColor;
  final Color? steamColor;
  final bool glowEnabled;
  final Duration animationDuration;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      image: true,
      label: 'مجرة الأوتاكو',
      child: SizedBox.square(
        dimension: size,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(size * 0.24),
          child: Image.asset(
            'assets/branding/otaku-galaxy-logo.jpg',
            fit: BoxFit.cover,
            filterQuality: FilterQuality.high,
          ),
        ),
      ),
    );
  }
}

class OtakuStoreLogoSimple extends StatelessWidget {
  const OtakuStoreLogoSimple({
    super.key,
    this.size = AppDimens.iconLogo,
    this.color,
  });

  final double size;
  final Color? color;

  @override
  Widget build(BuildContext context) => OtakuStoreLogo(size: size);
}
