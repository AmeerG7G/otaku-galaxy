import { Alert, Flex, Form, Image, Tag, Typography } from 'antd'
import { customerGallery, type GalleryColour } from '../utils/gallery'
import { resolveMediaUrl } from '../utils/media'
import { NO_IMAGE_PLACEHOLDER } from './ui/placeholder'

/**
 * معاينة معرض المنتج كما يراه الزبون: صورة كل لونٍ نشط ثم الصور العامة، بلا
 * تكرار ([customerGallery]). للقراءة فقط — لا تغيّر شيئاً في النموذج.
 */
export default function GalleryPreview() {
  const form = Form.useFormInstance()
  const images: string[] = Form.useWatch('images', form) ?? []
  const colours: GalleryColour[] = Form.useWatch('variants', form) ?? []
  const { entries, duplicates, inactiveColours } = customerGallery(images, colours)

  return (
    <Flex vertical gap={12} data-testid="gallery-preview">
      <Typography.Text type="secondary">
        صورة كل لونٍ تظهر في المعرض تلقائياً ولا حاجة لرفعها مرةً ثانية بين الصور العامة. ترتيب المعرض: صور الألوان بترتيبها، ثم الصور العامة بترتيبها. تصفّح الزبون للمعرض لا يختار له لوناً.
      </Typography.Text>
      {entries.length === 0 ? (
        <Typography.Text type="secondary" data-testid="gallery-preview-empty">
          لا صور بعد — يرى الزبون مكان صورةٍ فارغاً.
        </Typography.Text>
      ) : (
        <Flex wrap gap={12} component="ol" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {entries.map((entry, index) => (
            <Flex key={`${entry.kind}-${entry.ref}`} vertical align="center" gap={4} component="li" data-testid="gallery-preview-item" style={{ width: 96 }}>
              <Image
                src={resolveMediaUrl(entry.ref)}
                width={72}
                height={72}
                style={{ objectFit: 'cover', borderRadius: 6 }}
                preview={false}
                fallback={NO_IMAGE_PLACEHOLDER}
                alt={`صورة المعرض ${index + 1}`}
              />
              <Typography.Text style={{ fontSize: 12 }}>{index + 1}</Typography.Text>
              {entry.kind === 'colour' ? (
                <Tag color="purple" style={{ marginInlineEnd: 0, whiteSpace: 'normal', textAlign: 'center' }}>
                  {entry.colourNames.length > 0 ? `اللون: ${entry.colourNames.join('، ')}` : 'صورة لون'}
                </Tag>
              ) : (
                <Tag style={{ marginInlineEnd: 0 }}>صورة عامة</Tag>
              )}
            </Flex>
          ))}
        </Flex>
      )}
      {duplicates.map((duplicate) => (
        <Alert
          key={duplicate.position}
          type="info"
          showIcon
          data-testid="gallery-preview-duplicate"
          message={`الصورة العامة ${duplicate.position + 1} هي نفسها صورة ${
            duplicate.colourNames.length > 0 ? `اللون «${duplicate.colourNames.join('، ')}»` : 'لون'
          } — تظهر للزبون مرةً واحدة. يمكن حذفها من الصور العامة، أو إبقاؤها.`}
        />
      ))}
      {inactiveColours > 0 && (
        <Typography.Text type="secondary" data-testid="gallery-preview-inactive">
          {`صور الألوان الموقوفة (${inactiveColours}) لا تظهر للزبون.`}
        </Typography.Text>
      )}
    </Flex>
  )
}
