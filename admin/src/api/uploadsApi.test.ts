import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { client } from './client'
import { MAX_UPLOAD_BYTES, UPLOAD_TIMEOUT_MS, uploadImage } from './uploadsApi'

/**
 * رفع صور اللوحة عبر **العميل الحقيقي** — لا يُستبدل إلا محوّل الشبكة.
 *
 * [CRITICAL] `client` مضبوط على `Content-Type: application/json` افتراضياً،
 * وaxios يحوّل `FormData` إلى **JSON** متى رأى تلك الترويسة (`formDataToJSON`)
 * — فيصل الملف إلى الخادم كائناً فارغاً ويردّ `multer` «لم تُرفق صورة». الرفع
 * يُلغي الترويسة صراحةً؛ هذه الاختبارات تمرّ بمسار axios الحقيقي فتسقط إن
 * عاد ذلك الإلغاء يوماً أو تغيّر سلوك المكتبة.
 */

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>')

let sent: InternalAxiosRequestConfig[] = []
let respond: (config: InternalAxiosRequestConfig) => ReturnType<AxiosAdapter>

const originalAdapter = client.defaults.adapter

beforeEach(() => {
  sent = []
  respond = async (config) => ({
    data: {
      success: true,
      data: { id: 'm1', url: '/uploads/product/2026/09/abc.jpg' },
      message: 'تم رفع الصورة',
    },
    status: 201,
    statusText: 'Created',
    headers: {},
    config,
  })
  client.defaults.adapter = (config) => {
    sent.push(config)
    return respond(config)
  }
})

afterEach(() => {
  client.defaults.adapter = originalAdapter
})

function failWith(status: number, data: unknown) {
  respond = async (config) => {
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
      data,
      status,
      statusText: '',
      headers: {},
      config,
    })
  }
}

describe('uploadImage — ما يصل الخادم فعلاً', () => {
  it('multipart حقيقي: الملف والغرض في FormData، بلا ترويسة JSON، بمهلة رفعٍ لا مهلة JSON', async () => {
    const url = await uploadImage(new File([JPEG], 'photo.jpg', { type: 'image/jpeg' }), 'product')

    expect(url).toBe('/uploads/product/2026/09/abc.jpg')
    expect(sent).toHaveLength(1)
    const [request] = sent
    expect(request.method).toBe('post')
    expect(request.url).toBe('/admin/uploads')
    // FormData وصل المحوّل كما هو — لم يُحوَّل JSON.
    expect(request.data).toBeInstanceOf(FormData)
    expect(String(request.headers.getContentType() ?? '')).not.toContain('application/json')
    const form = request.data as FormData
    expect(form.get('purpose')).toBe('product')
    const file = form.get('file') as File
    expect(file).toBeInstanceOf(File)
    expect(file.size).toBe(JPEG.length)
    expect(request.timeout).toBe(UPLOAD_TIMEOUT_MS)
    expect(UPLOAD_TIMEOUT_MS).toBeGreaterThanOrEqual(60_000)
  })

  /**
   * النوع الذي يعلنه المتصفّح يأتي من الامتداد. الملف يُوسَم بنوعه **الحقيقي**
   * (من توقيعه) واسمٍ محايد — فيقبله حتى خادمٌ أقدم يفحص الوسم، ولا يخرج اسمُ
   * ملف المسؤول من جهازه.
   */
  it('يَسِم الملف بنوعه الحقيقي واسمٍ محايد مهما أعلن المتصفّح', async () => {
    await uploadImage(new File([PNG], 'صورة جواز سفري.jpg', { type: '' }), 'banner')

    const file = (sent[0].data as FormData).get('file') as File
    expect(file.type).toBe('image/png')
    expect(file.name).toBe('image.png')
  })
})

describe('uploadImage — رفضٌ قبل الشبكة برسالةٍ مفهومة', () => {
  it('ملفٌّ فوق ٥ ميغابايت يُرفض محلياً دون طلب', async () => {
    const big = new File([JPEG, new Uint8Array(MAX_UPLOAD_BYTES)], 'big.jpg', { type: 'image/jpeg' })
    await expect(uploadImage(big, 'product')).rejects.toThrow(
      'حجم الصورة أكبر من الحدّ المسموح (5 ميغابايت)',
    )
    expect(sent).toHaveLength(0)
  })

  it('محتوى ليس صورة (ولو وُسم image/png) يُرفض محلياً دون طلب', async () => {
    await expect(
      uploadImage(new File([HTML], 'evil.png', { type: 'image/png' }), 'product'),
    ).rejects.toThrow('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)')
    expect(sent).toHaveLength(0)
  })

  it('ملفٌّ فارغ يُرفض محلياً', async () => {
    await expect(uploadImage(new File([], 'x.jpg', { type: 'image/jpeg' }), 'product')).rejects.toThrow(
      'الملف فارغ',
    )
    expect(sent).toHaveLength(0)
  })
})

describe('uploadImage — أخطاء الخادم والشبكة لا تُبتلع', () => {
  it('رسالة الخادم تصل كما هي (نوعٌ مرفوض، صلاحية)', async () => {
    failWith(403, {
      success: false,
      data: null,
      message: 'لا تملك صلاحية هذا القسم',
      error: { code: 'ADMIN_PERMISSION_DENIED' },
    })
    await expect(
      uploadImage(new File([JPEG], 'a.jpg', { type: 'image/jpeg' }), 'banner'),
    ).rejects.toMatchObject({ message: 'لا تملك صلاحية هذا القسم', status: 403, code: 'ADMIN_PERMISSION_DENIED' })
  })

  /** nginx يردّ ٤١٣ بصفحة HTML قبل أن يصل الطلب إلى الخادم — لا مغلّف JSON. */
  it('٤١٣ من الوسيط (بلا مغلّف) يقول إن الملف كبير لا «تعذر إكمال الطلب»', async () => {
    failWith(413, '<html><body>413 Request Entity Too Large</body></html>')
    await expect(
      uploadImage(new File([JPEG], 'a.jpg', { type: 'image/jpeg' }), 'product'),
    ).rejects.toMatchObject({ status: 413, message: 'حجم الملف أكبر من الحدّ المسموح' })
  })

  it('انتهاء المهلة يقول ذلك', async () => {
    respond = async (config) => {
      throw new AxiosError('timeout of 120000ms exceeded', 'ECONNABORTED', config)
    }
    await expect(
      uploadImage(new File([JPEG], 'a.jpg', { type: 'image/jpeg' }), 'product'),
    ).rejects.toThrow('انتهت مهلة الاتصال بالخادم — أعد المحاولة')
  })

  it.each([
    ['بلا data', { success: true, data: null, message: '' }],
    ['بلا url', { success: true, data: { id: 'm1' }, message: '' }],
    ['url ليس مرجع صورة', { success: true, data: { id: 'm1', url: 'javascript:alert(1)' }, message: '' }],
  ])('ردٌّ ناجح %s يُرفض «استجابة غير صالحة» بدل حفظ قيمةٍ فاسدة', async (_label, body) => {
    respond = async (config) => ({ data: body, status: 201, statusText: 'Created', headers: {}, config })
    await expect(
      uploadImage(new File([JPEG], 'a.jpg', { type: 'image/jpeg' }), 'product'),
    ).rejects.toThrow('استجابة غير صالحة من الخادم — أعد المحاولة')
  })
})

