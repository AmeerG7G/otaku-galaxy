import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert,
  App,
  Breadcrumb,
  Button,
  Flex,
  Spin,
  Typography,
} from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { getProductForEdit, updateProduct } from '../api/productsApi'
import { ApiError } from '../api/client'

export default function ProductEditPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const queryClient = useQueryClient()

  const editQuery = useQuery({
    queryKey: ['product-edit', id],
    queryFn: () => getProductForEdit(id),
    enabled: Boolean(id),
  })

  const updateMutation = useMutation({
    mutationFn: (input: { payload: Parameters<typeof updateProduct>[1] }) =>
      updateProduct(id, input.payload),
    onSuccess: (result) => {
      message.success(result.message)
      queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate('/products')
    },
    onError: (error) => {
      message.error(error instanceof ApiError ? error.message : 'حدث خطأ غير متوقع')
    },
  })

  function handleSubmit(values: ProductFormValues) {
    const optionsLoaded = editQuery.data?.optionsLoaded ?? true
    const payload = {
      name: values.name,
      description: values.description,
      price: values.price,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId ?? null,
      stock: values.stock,
      images: values.images,
      options: optionsLoaded ? values.options : [],
      isOffer: values.isOffer,
      isSelected: values.isSelected,
      isActive: values.isActive,
      rating: values.rating ?? null,
      reviewCount: values.reviewCount ?? 0,
    }
    if (optionsLoaded) {
      updateMutation.mutate({ payload })
      return
    }
    // المنتج معطّل = الخادم لا يوفر خياراته — أي حفظ يُمسحها (خَلل في واجهة
    // الخادم: شكل التحديث يملأ الخيارات بـ [] افتراضياً). نتطلب تأكيداً صريحاً.
    modal.confirm({
      title: 'تحذير: سيُمسح هذا الخيارات؟',
      content:
        'المنتج غير نشط، وخادم الإدارة لا يوفر خياراته، وأي حفظ للتعديلات سيُمسح ' +
        'الخيارات المحفوظة نهائياً من قاعدة البيانات. هل تريد المتابعة؟',
      okText: 'نعم، احفظ وامسح الخيارات',
      okButtonProps: { danger: true },
      cancelText: 'إلغاء',
      onOk: () => updateMutation.mutateAsync({ payload }),
    })
  }

  return (
    <div style={{ maxWidth: 860, width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/products">المنتجات</Link> },
          { title: 'تعديل منتج' },
        ]}
      />
      <div style={{ height: 12 }} />
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          تعديل منتج
        </Typography.Title>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/products')}>
          العودة إلى المنتجات
        </Button>
      </Flex>
      <div style={{ height: 16 }} />

      {editQuery.isPending && (
        <Flex justify="center" style={{ paddingTop: 80 }}>
          <Spin size="large" tip="جارٍ تحميل المنتج…">
            <div style={{ width: 120, height: 60 }} />
          </Spin>
        </Flex>
      )}

      {editQuery.isError && (
        <Alert
          type="error"
          showIcon
          message="تعذر تحميل المنتج"
          description={editQuery.error.message}
          action={
            <Button onClick={() => editQuery.refetch()}>إعادة المحاولة</Button>
          }
        />
      )}

      {editQuery.data && (
        <ProductForm
          key={id}
          mode="edit"
          initialValues={editQuery.data.draft}
          optionsAvailable={editQuery.data.optionsLoaded}
          submitting={updateMutation.isPending}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/products')}
        />
      )}
    </div>
  )
}