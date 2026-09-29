import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, App, Button, Drawer, Flex, Space, Switch, Typography } from 'antd'
import {
  fetchAdminNotificationPrefs,
  fetchPushStatus,
  setAdminNotificationPref,
} from '../api/adminAccountsApi'
import { ADMIN_PUSH_EVENT_LABELS, type AdminPushEvent } from '../types/adminPermissions'
import {
  disableWebPush,
  enableWebPush,
  storedToken,
  webPushConfigured,
  webPushSupported,
} from '../push/webPush'

const REASONS: Record<string, string> = {
  not_configured: 'إشعارات الويب غير مُعدّة في هذه النسخة من اللوحة.',
  unsupported:
    'هذا المتصفّح لا يدعم الإشعارات. على iPhone: أضف اللوحة إلى الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم افتحها من هناك.',
  denied: 'رُفض إذن الإشعارات. فعّله من إعدادات المتصفّح لهذا الموقع ثم أعد المحاولة.',
  failed: 'تعذّر تفعيل الإشعارات على هذا الجهاز.',
}

/**
 * إشعارات هذا الجهاز — لكل مسؤول، بلا صلاحية قسم (STEP 64 §14).
 *
 * التنبيهات تصل من يملك قسم الحدث فقط (الطلبات، طلبات الحساب، طلبات التوفر)
 * — الخادم يقرّر، وهذه التفضيلات تُطفئ ما لا يريده المسؤول منها.
 */
export default function AdminPushDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp()
  const queryClient = useQueryClient()
  const [enabledHere, setEnabledHere] = useState(() => Boolean(storedToken()))
  const [problem, setProblem] = useState<string | null>(null)

  const status = useQuery({ queryKey: ['admin-push-status'], queryFn: fetchPushStatus, enabled: open })
  const prefs = useQuery({ queryKey: ['admin-push-prefs'], queryFn: fetchAdminNotificationPrefs, enabled: open })

  const toggleDevice = useMutation({
    mutationFn: async (on: boolean) => {
      if (!on) {
        await disableWebPush()
        return { ok: true as const }
      }
      return enableWebPush()
    },
    onSuccess: (result, on) => {
      if (result.ok) {
        setProblem(null)
        setEnabledHere(on)
        message.success(on ? 'فُعّلت الإشعارات على هذا الجهاز' : 'أُوقفت الإشعارات على هذا الجهاز')
      } else {
        setProblem(REASONS[result.reason] ?? REASONS.failed!)
      }
      void queryClient.invalidateQueries({ queryKey: ['admin-push-status'] })
    },
    onError: (error: Error) => setProblem(error.message),
  })

  const setPref = useMutation({
    mutationFn: ({ key, enabled }: { key: AdminPushEvent; enabled: boolean }) => setAdminNotificationPref(key, enabled),
    onSuccess: (data) => queryClient.setQueryData(['admin-push-prefs'], data),
    onError: (error: Error) => message.error(error.message),
  })

  const serverReady = status.data?.configured ?? false
  return (
    <Drawer title="إشعارات هذا الجهاز" open={open} onClose={onClose} placement="left" width={360} destroyOnHidden>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        {!webPushConfigured() || (status.data && !serverReady) ? (
          <Alert
            type="warning"
            showIcon
            message="الإشعارات غير مُعدّة بعد"
            description={
              !webPushConfigured()
                ? 'تحتاج اللوحة إعداد Firebase للويب (VITE_FIREBASE_*) عند البناء.'
                : 'يحتاج الخادم اعتماد FCM (FCM_PROJECT_ID وأخواته) في بيئته.'
            }
          />
        ) : null}

        <Flex justify="space-between" align="center" gap={12}>
          <Typography.Text strong>التنبيهات على هذا الجهاز</Typography.Text>
          <Switch
            checked={enabledHere}
            loading={toggleDevice.isPending}
            disabled={!webPushConfigured() || (!enabledHere && !webPushSupported())}
            onChange={(on) => toggleDevice.mutate(on)}
          />
        </Flex>
        {problem && <Alert type="error" showIcon message={problem} />}

        <div>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
            ما يصلك (من أقسامك فقط)
          </Typography.Text>
          <Space direction="vertical" size={10} style={{ width: '100%' }}>
            {(Object.keys(ADMIN_PUSH_EVENT_LABELS) as AdminPushEvent[]).map((key) => (
              <Flex key={key} justify="space-between" align="center" gap={12}>
                <Typography.Text>{ADMIN_PUSH_EVENT_LABELS[key]}</Typography.Text>
                <Switch
                  size="small"
                  checked={prefs.data?.prefs[key] ?? true}
                  loading={setPref.isPending && setPref.variables?.key === key}
                  onChange={(enabled) => setPref.mutate({ key, enabled })}
                />
              </Flex>
            ))}
          </Space>
        </div>
        {status.data && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            أجهزتك المسجّلة: {status.data.devices}
          </Typography.Text>
        )}
        <Button block onClick={onClose}>
          إغلاق
        </Button>
      </Space>
    </Drawer>
  )
}
