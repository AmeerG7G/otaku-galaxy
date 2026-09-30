import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { App as AntApp, ConfigProvider, Form, type FormInstance } from 'antd'

vi.mock('../api/uploadsApi', () => ({ uploadImage: vi.fn() }))

import { uploadImage } from '../api/uploadsApi'
import ImageUploadField from './ImageUploadField'
import ImagesEditor from './ImagesEditor'

/**
 * مكوّنا الرفع في اللوحة: اختيار ← رفع ← القيمة في النموذج ← المعاينة.
 *
 * [CRITICAL] الفشل لا يمسّ الصورة القائمة: استبدالٌ فشل رفعُه يُبقي القديمة،
 * ورسالة الخادم تظهر للمسؤول بدل أن يُبتلع الخطأ.
 */

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const MEDIA_ORIGIN = 'http://localhost:4000'

function pick(name = 'new.png') {
  return new File([PNG], name, { type: 'image/png' })
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

function shell(children: React.ReactNode) {
  return (
    <ConfigProvider direction="rtl" theme={{ token: { motion: false } }}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}

beforeEach(() => {
  vi.mocked(uploadImage).mockClear()
})

describe('ImageUploadField (البنر)', () => {
  it('الرفع الناجح يضع المرجع النسبي في الحقل ويعرضه من أصل الخادم', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/banner/2026/09/new.png')
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { container } = render(shell(<ImageUploadField purpose="banner" onChange={onChange} />))

    await user.upload(fileInput(container), pick())

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('/uploads/banner/2026/09/new.png'))
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'banner')
    expect(await screen.findByText('رُفعت الصورة')).toBeInTheDocument()
  })

  it('المعاينة تُحمَّل من أصل الـAPI لا من أصل اللوحة', () => {
    const { container } = render(
      shell(<ImageUploadField purpose="banner" value="/uploads/banner/2026/09/a.png" />),
    )
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toBe(`${MEDIA_ORIGIN}/uploads/banner/2026/09/a.png`)
  })

  it('فشل الرفع يعرض رسالة الخادم ولا يمسّ الصورة القائمة', async () => {
    vi.mocked(uploadImage).mockImplementation(async () => {
      throw new Error('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)')
    })
    const onChange = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      shell(
        <ImageUploadField
          purpose="banner"
          value="/uploads/banner/2026/09/old.png"
          onChange={onChange}
        />,
      ),
    )

    await user.upload(fileInput(container), pick())

    expect(await screen.findByText('نوع الصورة غير مدعوم (JPG/PNG/WebP فقط)')).toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
    expect(container.querySelector('input:not([type="file"])')).toHaveValue(
      '/uploads/banner/2026/09/old.png',
    )
  })
})

describe('ImagesEditor (صور المنتج)', () => {
  function renderEditor(initial: string[]) {
    const holder: { form?: FormInstance } = {}
    function Harness() {
      const [instance] = Form.useForm()
      useEffect(() => {
        holder.form = instance
      }, [instance])
      return (
        <Form form={instance} initialValues={{ images: initial }}>
          <ImagesEditor purpose="product" />
        </Form>
      )
    }
    const view = render(shell(<Harness />))
    return { ...view, images: () => holder.form!.getFieldValue('images') as string[] }
  }

  it('الرفع يُلحق المرجع بالصور القائمة', async () => {
    vi.mocked(uploadImage).mockResolvedValue('/uploads/product/2026/09/b.png')
    const user = userEvent.setup()
    const { container, images } = renderEditor(['/uploads/product/2026/09/a.png'])

    await user.upload(fileInput(container), pick())

    await waitFor(() =>
      expect(images()).toEqual([
        '/uploads/product/2026/09/a.png',
        '/uploads/product/2026/09/b.png',
      ]),
    )
    expect(uploadImage).toHaveBeenCalledWith(expect.any(File), 'product')
  })

  it('فشل الرفع يُبقي الصور كما هي ويعرض السبب', async () => {
    vi.mocked(uploadImage).mockImplementation(async () => {
      throw new Error('انتهت مهلة الاتصال بالخادم — أعد المحاولة')
    })
    const user = userEvent.setup()
    const { container, images } = renderEditor(['/uploads/product/2026/09/a.png'])

    await user.upload(fileInput(container), pick())

    expect(await screen.findByText('انتهت مهلة الاتصال بالخادم — أعد المحاولة')).toBeInTheDocument()
    expect(images()).toEqual(['/uploads/product/2026/09/a.png'])
  })

  /**
   * [CRITICAL] الرفع يستغرق ثوانيَ على خطٍّ حقيقي، والمسؤول يحذف صورةً خلالها.
   * الإلحاق كان على لقطة القائمة **وقت بدء** الرفع، فتعود الصورة المحذوفة.
   */
  it('صورةٌ حُذفت أثناء الرفع لا تعود عند اكتماله', async () => {
    let finish!: (url: string) => void
    vi.mocked(uploadImage).mockImplementation(
      () => new Promise<string>((resolve) => { finish = resolve }),
    )
    const user = userEvent.setup()
    const { container, images } = renderEditor(['/uploads/product/2026/09/a.png'])

    await user.upload(fileInput(container), pick())
    await waitFor(() => expect(uploadImage).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'حذف الصورة' }))
    expect(images()).toEqual([])

    await act(async () => finish('/uploads/product/2026/09/b.png'))

    await waitFor(() => expect(images()).toEqual(['/uploads/product/2026/09/b.png']))
  })
})
