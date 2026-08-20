import 'package:flutter/material.dart';

class AnimeDivider extends StatelessWidget {
  const AnimeDivider({
    super.key,
    this.thickness = 1,
    this.indent = 0,
    this.endIndent = 0,
    this.color,
    this.gradient,
  });

  final double thickness;
  final double indent;
  final double endIndent;
  final Color? color;
  final LinearGradient? gradient;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: EdgeInsets.only(left: indent, right: endIndent),
      height: thickness,
      decoration: BoxDecoration(
        gradient: gradient,
        color: gradient == null
            ? (color ?? Theme.of(context).colorScheme.outlineVariant)
            : null,
        borderRadius: BorderRadius.circular(thickness / 2),
      ),
    );
  }
}

/// بطاقة طلب بتصميم أنمي
