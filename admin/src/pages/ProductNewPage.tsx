import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { App, Breadcrumb, Button, Flex, Typography } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import ProductForm, { type ProductFormValues } from '../components/ProductForm'
import { createProduct } from '../api/productsApi'
import { ApiError } from '../api/client'

export default function ProductNewPage() {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const queryClient = useQueryClient()

  const createMutation = useMutation({
    mutationFn: createProduct,
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
    createMutation.mutate({
      name: values.name,
      description: values.description,
      price: values.price,
      categoryId: values.categoryId,
      subcategoryId: values.subcategoryId ?? null,
      stock: values.stock,
      images: values.images,
      options: values.options,
      isOffer: values.isOffer,
      isSelected: values.isSelected,
    })
  }

  return (
    <div style={{ maxWidth: 860, width: '100%' }}>
      <Breadcrumb
        items={[
          { title: <Link to="/products">المنتجات</Link> },
          { title: 'إضافة منتج' },
        ]}
      />
      <div style={{ height: 12 }} />
      <Flex align="center" justify="space-between" wrap gap={12}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          إضافة منتج
        </Typography.Title>
        <Button icon={<ArrowRightOutlined />} onClick={() => navigate('/products')}>
          العودة إلى المنتجات
        </Button>
      </Flex>
      <div style={{ height: 16 }} />
      <ProductForm
        mode="create"
        optionsAvailable
        initialValues={{
          images: [],
          options: [],
          isOffer: false,
          isSelected: false,
        }}
        submitting={createMutation.isPending}
        onSubmit={handleSubmit}
        onCancel={() => navigate('/products')}
      />
    </div>
  )
}