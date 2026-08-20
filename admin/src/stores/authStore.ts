import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { PublicUser } from '../types/api'

interface AuthState {
  token: string | null
  user: PublicUser | null
  setSession: (token: string, user: PublicUser) => void
  setUser: (user: PublicUser) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: (token, user) => set({ token, user }),
      setUser: (user) => set({ user }),
      clear: () => set({ token: null, user: null }),
    }),
    { name: 'otaku-galaxy-admin-session' },
  ),
)