import { Card, Result } from 'antd'
import { ToolOutlined } from '@ant-design/icons'

interface PagePlaceholderProps {
  title: string
  description: string
}

export default function PagePlaceholder({
  title,
  description,
}: PagePlaceholderProps) {
  return (
    <Card>
      <Result
        icon={<ToolOutlined />}
        title={title}
        subTitle={description}
      />
    </Card>
  )
}