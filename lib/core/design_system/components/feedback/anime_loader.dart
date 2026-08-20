import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../../tokens/app_dimens.dart';

class AnimeLoader extends StatefulWidget {
  const AnimeLoader({
    super.key,
    this.size = AppDimens.iconHero,
    this.color,
    this.strokeWidth = 3,
  });

  final double size;
  final Color? color;
  final double strokeWidth;

  @override
  State<AnimeLoader> createState() => _AnimeLoaderState();
}

class _AnimeLoaderState extends State<AnimeLoader>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _rotation;
  late final Animation<double> _stroke;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    )..repeat();

    _rotation = Tween<double>(
      begin: 0,
      end: 1,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));

    _stroke = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.1, end: 0.8), weight: 1),
      TweenSequenceItem(tween: Tween(begin: 0.8, end: 0.1), weight: 1),
    ]).animate(CurvedAnimation(parent: _controller, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final effectiveColor =
        widget.color ?? Theme.of(context).colorScheme.primary;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.rotate(
          angle: _rotation.value * 2 * 3.14159,
          child: CustomPaint(
            size: Size(widget.size, widget.size),
            painter: _AnimeLoaderPainter(
              color: effectiveColor,
              strokeWidth: widget.strokeWidth,
              strokeProgress: _stroke.value,
            ),
          ),
        );
      },
    );
  }
}

class _AnimeLoaderPainter extends CustomPainter {
  _AnimeLoaderPainter({
    required this.color,
    required this.strokeWidth,
    required this.strokeProgress,
  });

  final Color color;
  final double strokeWidth;
  final double strokeProgress;

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = (size.width - strokeWidth) / 2;

    // دائرة الخلفية
    final bgPaint = Paint()
      ..color = color.withValues(alpha: 0.1)
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    canvas.drawCircle(center, radius, bgPaint);

    // قوس التحميل
    final progressPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = strokeWidth
      ..strokeCap = StrokeCap.round;

    final sweepAngle = 2 * 3.14159 * strokeProgress;
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      -3.14159 / 2,
      sweepAngle,
      false,
      progressPaint,
    );

    // رأس القوس (نقطة متوهجة)
    final headAngle = -3.14159 / 2 + sweepAngle;
    final headX = center.dx + radius * math.cos(headAngle);
    final headY = center.dy + radius * math.sin(headAngle);

    final headPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    canvas.drawCircle(Offset(headX, headY), strokeWidth * 1.2, headPaint);
  }

  @override
  bool shouldRepaint(covariant _AnimeLoaderPainter oldDelegate) {
    return oldDelegate.strokeProgress != strokeProgress;
  }
}

/// مؤشر تحميل خطي بتصميم أنمي
