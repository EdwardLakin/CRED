'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const THEME_STORAGE_KEY = 'cred-theme'
const THEME_OPTIONS = new Set<ThemeMode>(['light', 'dark', 'system'])
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'light'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function getStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)

  return THEME_OPTIONS.has(storedTheme as ThemeMode) ? (storedTheme as ThemeMode) : 'system'
}

function applyTheme(mode: ThemeMode) {
  const resolvedTheme = mode === 'system' ? getSystemTheme() : mode
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.style.colorScheme = resolvedTheme

  return resolvedTheme
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  useEffect(() => {
    const storedMode = getStoredTheme()
    const resolvedStoredTheme = applyTheme(storedMode)
    const timerId = window.setTimeout(() => {
      setModeState(storedMode)
      setResolvedTheme(resolvedStoredTheme)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    function handleSystemThemeChange() {
      setResolvedTheme((currentResolvedTheme) => {
        if (mode !== 'system') {
          return currentResolvedTheme
        }

        return applyTheme('system')
      })
    }

    mediaQuery.addEventListener('change', handleSystemThemeChange)

    return () => mediaQuery.removeEventListener('change', handleSystemThemeChange)
  }, [mode])

  const setMode = useCallback((nextMode: ThemeMode) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextMode)
    setModeState(nextMode)
    setResolvedTheme(applyTheme(nextMode))
  }, [])

  const value = useMemo(() => ({ mode, resolvedTheme, setMode }), [mode, resolvedTheme, setMode])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider')
  }

  return context
}
