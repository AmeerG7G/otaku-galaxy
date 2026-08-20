import 'package:flutter/material.dart';

String formatPrice(num price) {
  return '${price.toStringAsFixed(0)} د.ع';
}

void showSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
