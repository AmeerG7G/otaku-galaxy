import { get, post } from './client'
import type { LoginResult, PublicUser } from '../types/api'

export async function login(phone: string, password: string): Promise<LoginResult> {
  return post<LoginResult>('/auth/login', { phone, password })
}

export async function fetchMe(): Promise<PublicUser> {
  const body = await get<{ user: PublicUser }>('/auth/me')
  return body.user
}