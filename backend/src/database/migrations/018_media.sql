-- 018_media.sql
-- سجل الملفات المرفوعة (صور المنتجات، صور تقييمات العملاء، الصور الشخصية).
-- يتيح التنظيف ومعرفة مالك كل ملف؛ التخزين نفسه خلف واجهة سائق قابلة
-- للاستبدال (قرص محلي الآن، خدمة كائنات لاحقاً) بلا تغيير في الجداول.

CREATE TABLE media_files (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- مفتاح التخزين لدى السائق (مسار نسبي على القرص، أو مفتاح كائن).
  storage_key TEXT NOT NULL UNIQUE,
  url         TEXT NOT NULL,
  purpose     TEXT NOT NULL CHECK (purpose IN ('product', 'review', 'avatar', 'banner', 'franchise')),
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_files_uploader ON media_files (uploaded_by, created_at DESC);
CREATE INDEX idx_media_files_purpose ON media_files (purpose, created_at DESC);
