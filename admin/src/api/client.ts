import axios, { AxiosError, type AxiosRequestConfig } from 'axios'
import type { ApiEnvelope } from '../types/api'
import { useAuthStore } from '../stores/authStore'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function fallbackMessage(status: number): string {
  if (status === 0) return 'تعذر الاتصال بالخادم — تحقق من الشبكة ثم أعد المحاولة'
  if (status === 401) return 'الجلسة منتهية — سجّل الدخول مجدداً'
  if (status === 403) return 'لا تملك صلاحية للقيام بهذا الإجراء'
  if (status === 404) return 'العنصر المطلوب غير موجود'
  if (status >= 500) return 'حدث خطأ غير متوقع في الخادم'
  return 'تعذر إكمال الطلب'
}

const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

export { client }

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    const status = error.response?.status ?? 0
    if (status === 401) {
      const state = useAuthStore.getState()
      if (state.token) state.clear()
      if (window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    const body = error.response?.data
    const timedOut = error.code === 'ECONNABORTED'
    let message = body?.message ?? fallbackMessage(status)
    if (!body && !error.response && timedOut) {
      message = 'انتهت مهلة الاتصال بالخادم — أعد المحاولة'
    }
    const code = body?.error?.code ?? null
    return Promise.reject(new ApiError(message, status, code))
  },
)

export async function get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await client.get<ApiEnvelope<T>>(url, config)
  return response.data.data as T
}

export async function post<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await client.post<ApiEnvelope<T>>(url, data, config)
  return response.data.data as T
}

export async function patch<T>(
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const response = await client.patch<ApiEnvelope<T>>(url, data, config)
  return response.data.data as T
}

export async function remove<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await client.delete<ApiEnvelope<T>>(url, config)
  return response.data.data as T
}