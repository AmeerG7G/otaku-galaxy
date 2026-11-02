import { beforeEach, describe, expect, it, vi } from 'vitest'

// مهلة أوسع لجداول antd في jsdom — انظر `OffersPage.test.tsx`.
vi.setConfig({ testTimeout: 20_000 })
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App as AntApp, ConfigProvider } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../queryClient'

vi.mock('../api/categoriesApi', () => ({
  listAdminCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  createSubcategory: vi.fn(),
  deleteCategory: vi.fn(),
  updateSubcategory: vi.fn(),
  deleteSubcategory: vi.fn(),
}))

import { createCategory, listAdminCategories, updateCategory } from '../api/categoriesApi'
import CategoriesPage from './CategoriesPage'
import type { AdminCategory } from '../types/categories'

/**
 * الأقسام الرئيسية في اللوحة تطابق بطاقة القسم في التطبيق: اسمٌ وعددٌ
 * موسَّطان، بلا صورةٍ ولا حقلِ رفع — ولا يُمسح ما خُزّن من صورٍ سابقة.
 */
function category(overrides: Partial<AdminCategory> = {}): AdminCategory {
  return {
    id: 'c1',
    name: 'الحقائب',
    nameCkb: null,
    imageUrl: '/uploads/category/old.png',
    sortOrder: 1,
    isActive: true,
    subcategories: Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      name: `فرعي ${i}`,
      nameCkb: null,
      sortOrder: i,
      isActive: true,
    })),
    ...overrides,
  }
}

function renderPage() {
  return render(
    <QueryClientProvider client={createQueryClient({ retry: false })}>
      <ConfigProvider direction="rtl">
        <AntApp>
          <MemoryRouter>
            <CategoriesPage />
          </MemoryRouter>
        </AntApp>
      </ConfigProvider>
    </QueryClientProvider>,
  )
}

describe('الأقسام الرئيسية — بلا صورة، اسمٌ وعددٌ موسَّطان', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({ items: [category()] })
  })

  it('[CRITICAL] لا عمود صورة ولا مصغّرة ولو كان للقسم صورة مخزَّنة', async () => {
    renderPage()
    await screen.findByText('الحقائب')
    expect(screen.queryByRole('columnheader', { name: 'الصورة' })).not.toBeInTheDocument()
    expect(document.querySelector('img[src*="old.png"]')).toBeNull()
  })

  it('[CRITICAL] الاسم وعدد الأقسام الفرعية موسَّطان في خلاياهما', async () => {
    renderPage()
    const name = (await screen.findByText('الحقائب')).closest('td')!
    const count = screen.getByText('8 أقسام فرعية').closest('td')!
    // antd يضع المحاذاة نمطاً مضمَّناً على الخلية والترويسة معاً.
    expect(name.style.textAlign).toBe('center')
    expect(count.style.textAlign).toBe('center')
    expect(screen.getByRole('columnheader', { name: 'القسم' }).style.textAlign).toBe('center')
    expect(screen.getByRole('columnheader', { name: 'الأقسام الفرعية' }).style.textAlign).toBe('center')
  })

  it('[CRITICAL] نموذج التعديل بلا حقل صورة — والحفظ لا يُرسل imageUrl فلا يمسح المخزَّن', async () => {
    vi.mocked(updateCategory).mockResolvedValue({ message: 'تم' } as never)
    renderPage()
    await screen.findByText('الحقائب')
    const user = userEvent.setup()
    await user.click(screen.getByText('تعديل'))
    const dialog = (await screen.findByText('تعديل القسم: الحقائب')).closest('.ant-modal') as HTMLElement
    expect(within(dialog).queryByText(/صورة القسم/)).not.toBeInTheDocument()
    expect(dialog.querySelector('input[type="file"], .ant-upload')).toBeNull()

    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateCategory).mock.calls[0]![1]
    expect(payload).not.toHaveProperty('imageUrl')
    expect(payload.name).toBe('الحقائب')
  })
})

/**
 * [PRODUCT] (المالك، 2026-10-26) الاسم الكردي اختياري: يُكتب أو يُترك أو يُمسح،
 * والعربي لا يُمسّ. الفارغ يُعرض للزبون الكردي بالعربية (الخادم يسقط إليها).
 */
describe('الاسم الكردي للقسم — اختياري', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(updateCategory).mockResolvedValue({ message: 'تم' } as never)
    vi.mocked(createCategory).mockResolvedValue({ message: 'تم' } as never)
  })

  async function openEdit(saved: string | null) {
    vi.mocked(listAdminCategories).mockResolvedValue({ items: [category({ nameCkb: saved })] })
    renderPage()
    await screen.findByText('الحقائب')
    const user = userEvent.setup()
    await user.click(screen.getByText('تعديل'))
    const dialog = (await screen.findByText('تعديل القسم: الحقائب')).closest('.ant-modal') as HTMLElement
    return { user, dialog, input: within(dialog).getByLabelText('اسم القسم بالكردية (اختياري)') }
  }

  it('بلا ترجمة محفوظة وحقلٌ فارغ: الحفظ لا يرسل nameCkb (لا تغيير)', async () => {
    const { user, dialog, input } = await openEdit(null)
    expect(input).toHaveValue('')
    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateCategory).mock.calls[0]![1]).not.toHaveProperty('nameCkb')
  })

  it('إضافة الترجمة لاحقاً تُرسَل — والعربي كما هو', async () => {
    const { user, dialog, input } = await openEdit(null)
    await user.click(input)
    await user.paste('جانتاکان')
    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateCategory).mock.calls[0]![1]).toMatchObject({ name: 'الحقائب', nameCkb: 'جانتاکان' })
  })

  it('[CRITICAL] مسح الترجمة المحفوظة يرسل null — والعربي كما هو', async () => {
    const { user, dialog, input } = await openEdit('جانتاکان')
    expect(input).toHaveValue('جانتاکان')
    await user.clear(input)
    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(updateCategory).toHaveBeenCalledTimes(1))
    expect(vi.mocked(updateCategory).mock.calls[0]![1]).toMatchObject({ name: 'الحقائب', nameCkb: null })
  })

  it('[CRITICAL] إنشاء قسم بلا كردية لا يُحجَب — يُرسَل nameCkb: null', async () => {
    vi.mocked(listAdminCategories).mockResolvedValue({ items: [category()] })
    renderPage()
    await screen.findByText('الحقائب')
    const user = userEvent.setup()
    await user.click(screen.getAllByRole('button', { name: /إضافة قسم$/ })[0]!)
    const dialog = (await screen.findByText('إضافة قسم', { selector: '.ant-modal-title' })).closest(
      '.ant-modal',
    ) as HTMLElement
    await user.click(within(dialog).getByLabelText('اسم القسم'))
    await user.paste('الدفاتر')
    await user.click(within(dialog).getByText('حفظ'))
    await waitFor(() => expect(createCategory).toHaveBeenCalledTimes(1))
    expect(vi.mocked(createCategory).mock.calls[0]![0]).toMatchObject({ name: 'الدفاتر', nameCkb: null })
  })
})
