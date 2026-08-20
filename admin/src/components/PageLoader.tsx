import { Flex, Spin } from 'antd'

export default function PageLoader() {
  return (
    <Flex justify="center" align="center" style={{ minHeight: '50vh' }}>
      <Spin size="large" tip="جارٍ تحميل الصفحة…">
        <div style={{ width: 120, height: 60 }} />
      </Spin>
    </Flex>
  )
}