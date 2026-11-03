import { createContext, useContext, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type Modifier,
  type ScreenReaderInstructions,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { HolderOutlined } from '@ant-design/icons'

/**
 * صفوف جدولٍ تُرتَّب بالسحب — بالفأرة واللمس ولوحة المفاتيح (2026-11-03).
 *
 * يُستعمل مع `Table` من antd: `components={{ body: { row: SortableRow } }}`
 * وعمودٌ يعرض `<DragHandle />`. السحب من المقبض وحده، فالنقر على أزرار
 * الصف لا يبدأ سحباً، والسحب عموديٌّ فقط. كل قائمةٍ في سياقها الخاص: فرعيّات
 * قسمٍ لا تُسقَط في قسمٍ آخر لأن السياقين منفصلان أصلاً.
 */

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

const screenReaderInstructions: ScreenReaderInstructions = {
  draggable:
    'لتغيير الترتيب: اضغط المسافة أو Enter على المقبض، ثم الأسهم للأعلى والأسفل، ثم المسافة للإفلات أو Escape للإلغاء.',
}

function announcements(labelOf: (id: string) => string, positionOf: (id: string) => number): Announcements {
  return {
    onDragStart: ({ active }) => `التُقط «${labelOf(String(active.id))}»`,
    onDragOver: ({ active, over }) =>
      over ? `«${labelOf(String(active.id))}» في الموضع ${positionOf(String(over.id))}` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `أُفلت «${labelOf(String(active.id))}» في الموضع ${positionOf(String(over.id))}`
        : `أُلغي نقل «${labelOf(String(active.id))}»`,
    onDragCancel: ({ active }) => `أُلغي نقل «${labelOf(String(active.id))}»`,
  }
}

interface SortableRowsProps {
  ids: string[]
  /** اسم العنصر للقارئ الصوتي. */
  labelOf: (id: string) => string
  disabled?: boolean
  onDragStart?: () => void
  /** الترتيب الجديد كاملاً — لا يُنادى إن لم يتغيّر شيء. */
  onReorder: (ids: string[]) => void
  children: ReactNode
}

export function SortableRows({ ids, labelOf, disabled, onDragStart, onReorder, children }: SortableRowsProps) {
  const sensors = useSensors(
    // مسافةٌ قبل البدء كي لا يصير النقر سحباً؛ واللمس بتأخيرٍ قصير كي يبقى التمرير ممكناً.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const accessibility = useMemo(
    () => ({
      screenReaderInstructions,
      announcements: announcements(labelOf, (id) => ids.indexOf(id) + 1),
    }),
    [ids, labelOf],
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder(arrayMove(ids, from, to))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      accessibility={accessibility}
      onDragStart={onDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy} disabled={disabled}>
        {children}
      </SortableContext>
    </DndContext>
  )
}

interface HandleContextValue {
  setActivatorNodeRef?: (element: HTMLElement | null) => void
  listeners?: Record<string, unknown>
  attributes?: HTMLAttributes<HTMLElement>
  disabled?: boolean
}

const HandleContext = createContext<HandleContextValue>({})

interface SortableRowProps extends HTMLAttributes<HTMLTableRowElement> {
  'data-row-key'?: string
}

/** صفّ `tbody` قابلٌ للسحب — يُمرَّر لـ`Table` عبر `components.body.row`. */
export function SortableRow(props: SortableRowProps) {
  const id = props['data-row-key']
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: id ?? '', disabled: !id })
  // `SortableContext disabled` (حفظٌ جارٍ) يصل الصفّ عبر `aria-disabled`.
  const disabled = attributes['aria-disabled']
  const style: CSSProperties = {
    ...props.style,
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging
      ? {
          position: 'relative',
          zIndex: 2,
          background: 'var(--og-drag-row-bg, #fff7e6)',
          // الإطار المتقطّع هو موضع الإفلات: الصفّ نفسه يتنقّل إليه فيراه المسؤول قبل الإفلات.
          outline: '2px dashed var(--og-drag-indicator, #1677ff)',
          outlineOffset: -2,
          boxShadow: '0 6px 16px rgba(0, 0, 0, 0.16)',
        }
      : {}),
  }
  const handle = useMemo(
    () => ({ setActivatorNodeRef, listeners, attributes, disabled }),
    [setActivatorNodeRef, listeners, attributes, disabled],
  )
  if (!id) return <tr {...props} />
  return (
    <HandleContext.Provider value={handle}>
      <tr {...props} ref={setNodeRef} style={style} data-dragging={isDragging || undefined} />
    </HandleContext.Provider>
  )
}

/** مقبض السحب — زرٌّ حقيقي يصل إليه Tab ويعمل بالمسافة والأسهم. */
export function DragHandle({ label }: { label: string }) {
  const { setActivatorNodeRef, listeners, attributes, disabled } = useContext(HandleContext)
  return (
    <button
      type="button"
      ref={setActivatorNodeRef}
      {...attributes}
      {...listeners}
      aria-label={`اسحب لتغيير ترتيب «${label}»`}
      title="اسحب لتغيير الترتيب"
      disabled={disabled}
      className="og-drag-handle"
      style={{
        cursor: disabled ? 'not-allowed' : 'grab',
        // اللمس على المقبض سحبٌ لا تمرير.
        touchAction: 'none',
        border: 0,
        background: 'transparent',
        padding: 8,
        minWidth: 36,
        minHeight: 36,
        borderRadius: 6,
        fontSize: 18,
        lineHeight: 1,
        color: 'inherit',
        opacity: disabled ? 0.4 : 0.75,
      }}
    >
      <HolderOutlined aria-hidden />
    </button>
  )
}
