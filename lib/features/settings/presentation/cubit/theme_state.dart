import 'package:equatable/equatable.dart';

/// حالة المظهر (فاتح/داكن).
sealed class ThemeState extends Equatable {
  const ThemeState({required this.isDark});

  final bool isDark;

  @override
  List<Object?> get props => [isDark];
}

/// المظهر الفاتح.
final class ThemeLight extends ThemeState {
  const ThemeLight() : super(isDark: false);
}

/// المظهر الداكن.
final class ThemeDark extends ThemeState {
  const ThemeDark() : super(isDark: true);
}
