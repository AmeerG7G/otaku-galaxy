import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.setConfig({ testTimeout: 30_000 })
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  reorderCategories: vi.fn(),
  reorderSubcategories: vi.fn(),
}))

import { createCategory, listAdminCategories, reorderCategories, reorderSubcategories } from '../api/categoriesApi'
import { ApiError } from '../api/client'
import CategoriesPage from './CategoriesPage'
import type { AdminCategory } from '../types/categories'

/**
 * ترتيب الأقسام بالسحب (2026-11-03): مقبضٌ لكل صفّ، لا حقل رقمٍ للترتيب،
 * والحفظ فور الإفلات بالقائمة كاملة. لوحة المفاتيح تكفي للسحب: المسافة
 * تلتقط، والأسهم تنقل، والمسافة تُفلت.
 */
function sub(id: string, name: string) {
  return { id, name, nameCkb: null, sortOrder: 0, isActive: true }
}

function cat(id: string, name: string, subcategories = [sub(`${id}-a`, `${name} أ`), sub(`${id}-b`, `${name} ب`)]): AdminCategory {
  return { id, name, nameCkb: null, imageUrl: null, sortOrder: 0, isActive: true, subcategories }
}

const ITEMS = [cat('c1', 'ملابس'), cat('c2', 'قرطاسية'), cat('c3', 'حقائب')]

/**
 * jsdom لا يرسم: كل مستطيلٍ أصفار، فلا يجد مستشعر لوحة المفاتيح جاراً. نعطي
 * كل صفٍّ موضعاً من ترتيبه بين إخوته (٥٠ بكسل للصف) — هندسةٌ كافية للاختبار.
 */
const realRect = Element.prototype.getBoundingClientRect
beforeEach(() => {
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const row = this.closest('tr[data-row-key]')
    if (!row) return realRect.call(this)
    const rows = Array.from(row.parentElement!.querySelectorAll(':scope > tr[data-row-key]'))
    const index = rows.indexOf(row)
    const top = index * 50
    return { x: 0, y: top, top, left: 0, right: 500, bottom: top + 50, width: 500, height: 50, toJSON: () => ({}) } as DOMRect
  }
})
afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect
})

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

/** مستشعر لوحة المفاتيح يضيف مستمعيه بعد دورةٍ من الالتقاط — كل ضغطةٍ في دورتها. */
async function press(target: HTMLElement, key: string, code = key) {
  await act(async () => {
    fireEvent.keyDown(target, { key, code })
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

async function keyboardMove(handle: HTMLElement, key: 'ArrowDown' | 'ArrowUp', steps = 1) {
  handle.focus()
  await press(handle, ' ', 'Space')
  for (let i = 0; i < steps; i++) await press(handle, key)
  await press(handle, ' ', 'Space')
}

function mainRowNames() {
  const table = document.querySelector('.ant-table-tbody') as HTMLElement
  return Array.from(table.querySelectorAll(':scope > tr[data-row-key]')).map((row) =>
    row.getAttribute('data-row-key'),
  )
}

describe('ترتيب الأقسام بالسحب', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(listAdminCategories).mockResolvedValue({ items: ITEMS })
  })

  it('[CRITICAL] لكل قسمٍ مقبض سحب، ولا عمود رقمٍ ولا حقل «الترتيب» في النماذج', async () => {
    renderPage()
    await screen.findByText('ملابس')
    for (const name of ['ملابس', 'قرطاسية', 'حقائب']) {
      expect(document.querySelector(`button[aria-label="اسحب لتغيير ترتيب «${name}»"]`)).not.toBeNull()
    }
    // لا خلية ترتيبٍ رقمية: الأعمدة مقبضٌ ثم الاسم.
    const firstRow = document.querySelector('.ant-table-tbody > tr[data-row-key="c1"]')!
    expect(Array.from(firstRow.querySelectorAll('td')).some((td) => /^\d+$/.test(td.textContent?.trim() ?? ''))).toBe(false)

    vi.mocked(createCategory).mockResolvedValue({ message: 'تم' } as never)
    // `getByRole` على جدول antd بطيءٌ جداً في jsdom — بحثٌ مباشر عن الزرّ والنافذة.
    const add = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'إضافة قسم',
    )!
    fireEvent.click(add)
    const dialog = await waitFor(() => {
      const modal = document.querySelector('.ant-modal') as HTMLElement | null
      expect(modal).not.toBeNull()
      return modal!
    })
    expect(within(dialog).getByText('اسم القسم')).toBeInTheDocument()
    expect(within(dialog).queryByText('الترتيب')).not.toBeInTheDocument()
    expect(dialog.querySelector('.ant-input-number')).toBeNull()
  })

  it('[CRITICAL] السحب بلوحة المفاتيح يعرض الترتيب الجديد فوراً ويحفظ القائمة كاملة', async () => {
    let resolveSave: (value: { message: string }) => void = () => {}
    vi.mocked(reorderCategories).mockReturnValue(new Promise((resolve) => (resolveSave = resolve)))
    renderPage()
    await screen.findByText('ملابس')

    await keyboardMove(screen.getByRole('button', { name: 'اسحب لتغيير ترتيب «ملابس»' }), 'ArrowDown')

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledWith(['c2', 'c1', 'c3']))
    // الجدول بترتيبه الجديد قبل ردّ الخادم.
    expect(mainRowNames()).toEqual(['c2', 'c1', 'c3'])
    expect(await screen.findByText('جارٍ حفظ الترتيب…')).toBeInTheDocument()

    vi.mocked(listAdminCategories).mockResolvedValue({ items: [ITEMS[1]!, ITEMS[0]!, ITEMS[2]!] })
    await act(async () => resolveSave({ message: 'حُفظ ترتيب الأقسام' }))
    expect(await screen.findByText('حُفظ ترتيب الأقسام')).toBeInTheDocument()
    expect(mainRowNames()).toEqual(['c2', 'c1', 'c3'])
  })

  it('رفض الخادم يعيد الترتيب المحفوظ ويعرض رسالته', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(
      new ApiError('تغيّرت القائمة منذ فتحها — حدّث الصفحة ثم أعد الترتيب', 409, 'ORDER_STALE'),
    )
    renderPage()
    await screen.findByText('ملابس')

    await keyboardMove(screen.getByRole('button', { name: 'اسحب لتغيير ترتيب «حقائب»' }), 'ArrowUp', 2)

    await waitFor(() => expect(reorderCategories).toHaveBeenCalledWith(['c3', 'c1', 'c2']))
    expect(await screen.findByText('تغيّرت القائمة منذ فتحها — حدّث الصفحة ثم أعد الترتيب')).toBeInTheDocument()
    await waitFor(() => expect(mainRowNames()).toEqual(['c1', 'c2', 'c3']))
  })

  it('الإفلات في الموضع نفسه لا يرسل شيئاً، والإلغاء بـEscape كذلك', async () => {
    renderPage()
    await screen.findByText('ملابس')
    const handle = screen.getByRole('button', { name: 'اسحب لتغيير ترتيب «قرطاسية»' })
    handle.focus()
    await press(handle, ' ', 'Space')
    await press(handle, 'ArrowDown')
    await press(handle, 'Escape')
    await keyboardMove(handle, 'ArrowDown', 0)
    expect(reorderCategories).not.toHaveBeenCalled()
    expect(mainRowNames()).toEqual(['c1', 'c2', 'c3'])
  })

  it('[CRITICAL] فرعيّات قسمٍ تُرتَّب داخل قسمها وحده', async () => {
    vi.mocked(reorderSubcategories).mockResolvedValue({ message: 'حُفظ ترتيب الأقسام الفرعية' })
    renderPage()
    await screen.findByText('ملابس')
    const user = userEvent.setup()
    const expandButtons = document.querySelectorAll('.ant-table-row-expand-icon')
    await user.click(expandButtons[1] as HTMLElement)

    const handle = await screen.findByRole('button', { name: 'اسحب لتغيير ترتيب «قرطاسية أ»' })
    await keyboardMove(handle, 'ArrowDown')

    await waitFor(() => expect(reorderSubcategories).toHaveBeenCalledWith('c2', ['c2-b', 'c2-a']))
    expect(reorderCategories).not.toHaveBeenCalled()
    expect(await screen.findByText('حُفظ ترتيب الأقسام الفرعية')).toBeInTheDocument()
  })
})
