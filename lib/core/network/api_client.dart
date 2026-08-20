import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../errors/app_exception.dart';

/// عميل الـ API المركزي على [Dio].
///
/// يقرأ التوكن تلقائياً عبر [tokenProvider] ويضيفه لرؤوس الطلبات،
/// وعند استجابة 401 ينظّف الجلسة عبر [onUnauthorized] ثم يرمي [AppException].
/// جميع الإجابات تمر عبر المغلف الموحّد `{ success, data, message }`.
class ApiClient {
  ApiClient({
    AppConfig? config,
    this.tokenProvider,
    this.onUnauthorized,
    Dio? dio,
  }) : _dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl:
                   config?.effectiveApiBaseUrl ??
                   AppConfig.development.effectiveApiBaseUrl,
               connectTimeout: const Duration(seconds: 15),
               receiveTimeout: const Duration(seconds: 15),
               sendTimeout: const Duration(seconds: 15),
               headers: {
                 'Content-Type': 'application/json',
                 'Accept': 'application/json',
               },
             ),
           ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = tokenProvider?.call();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          _log('▶ ${options.method.toUpperCase()} ${options.uri}');
          handler.next(options);
        },
        onError: (error, handler) {
          final response = error.response;
          _log(
            '✖ ${error.requestOptions.method.toUpperCase()} '
            '${error.requestOptions.uri} — '
            'DioException[${error.type.name}] '
            '${error.message ?? 'no message'}'
            '${response != null ? ' — status ${response.statusCode}' : ''}',
          );
          if (response?.statusCode == 401) {
            onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  /// سجل تطويري يظهر العنوان الكامل والخطأ الحقيقي قبل أي تعميم.
  void _log(String message) {
    if (kDebugMode) debugPrint(message);
  }

  final Dio _dio;

  /// مزوّد التوكن الحالي (يُقرأ عند كل طلب).
  String? Function()? tokenProvider;

  /// استدعاء عند انتهاء الجلسة (401).
  void Function()? onUnauthorized;

  /// ربط الجلسة بعد بناء العميل (لتجنب الاعتماد الدائري في DI).
  void attachAuth({
    String? Function()? tokenProvider,
    void Function()? onUnauthorized,
  }) {
    this.tokenProvider = tokenProvider ?? this.tokenProvider;
    this.onUnauthorized = onUnauthorized ?? this.onUnauthorized;
  }

  /// GET — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> get(String path, {Map<String, dynamic>? query}) =>
      _request(() => _dio.get<dynamic>(path, queryParameters: query));

  /// POST — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> post(String path, {Object? body}) =>
      _request(() => _dio.post<dynamic>(path, data: body));

  /// PUT — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> put(String path, {Object? body}) =>
      _request(() => _dio.put<dynamic>(path, data: body));

  /// PATCH — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> patch(String path, {Object? body}) =>
      _request(() => _dio.patch<dynamic>(path, data: body));

  /// DELETE — يعيد حقل `data` من المغلف الموحّد.
  Future<dynamic> delete(String path) =>
      _request(() => _dio.delete<dynamic>(path));

  Future<dynamic> _request(Future<Response<dynamic>> Function() send) async {
    try {
      final response = await send();
      return _unwrap(response.statusCode ?? 0, response.data);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        onUnauthorized?.call();
      }
      throw _toAppException(e);
    }
  }

  /// فكّ المغلف الموحّد: نجاح = `data`، فشل = [AppException] برسالة الخادم.
  dynamic _unwrap(int statusCode, dynamic data) {
    if (statusCode == 401) {
      onUnauthorized?.call();
    }
    if (data is! Map<String, dynamic>) {
      throw AppException('استجابة غير متوقعة من الخادم');
    }
    if (data['success'] == true) {
      return data['data'];
    }
    throw AppException(_messageFrom(data, statusCode));
  }

  String _messageFrom(Map<String, dynamic> data, int statusCode) {
    final message = data['message'];
    if (message is String && message.trim().isNotEmpty) return message;
    switch (statusCode) {
      case 400:
        return 'طلب غير صالح';
      case 401:
        return 'انتهت الجلسة — سجّل الدخول مجدداً';
      case 403:
        return 'لا تملك صلاحية تنفيذ هذا الإجراء';
      case 404:
        return 'غير موجود';
      case 409:
        return 'تعارض مع البيانات الحالية';
      case 429:
        return 'طلبات كثيرة جداً — حاول لاحقاً';
      default:
        return 'تعذر الاتصال بالخادم';
    }
  }

  AppException _toAppException(DioException error) {
    final response = error.response;
    if (response != null) {
      final data = response.data;
      if (data is Map<String, dynamic>) {
        return AppException(_messageFrom(data, response.statusCode ?? 500));
      }
      return AppException('خطأ من الخادم (${response.statusCode})');
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return AppException(
          'انتهت مهلة الاتصال — حاول مرة أخرى (${error.message ?? 'timeout'})',
        );
      case DioExceptionType.connectionError:
        return AppException(
          'تعذر الاتصال بالخادم — تحقق من الإنترنت '
          '(${error.message ?? 'connection error'})',
        );
      default:
        return AppException(error.message ?? 'حدث خطأ غير متوقع');
    }
  }
}
