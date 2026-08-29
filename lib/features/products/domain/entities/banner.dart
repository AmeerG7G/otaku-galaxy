import '../../../../core/network/media_url.dart';

class Banner {
  const Banner({required this.id, this.imageUrl, this.link});

  final String id;
  final String? imageUrl;
  final String? link;

  factory Banner.fromJson(Map<String, dynamic> json) {
    // الخادم يرسل destinationValue — يوجه البانر عند الضغط.
    final destination = json['destinationValue'] as String?;
    return Banner(
      id: json['id']?.toString() ?? '',
      imageUrl: resolveMediaUrl(json['imageUrl'] as String?),
      link: destination ?? json['link'] as String?,
    );
  }
}
