'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useTransition, type ReactNode } from 'react'

import { saveThemePreference } from './actions'

export type ThemeMode = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  mode: ThemeMode
  resolvedTheme: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const THEME_STORAGE_KEY = 'cred-theme'
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') {
    return 'dark'
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(mode: ThemeMode) {
  const resolvedTheme = mode === 'system' ? getSystemTheme() : mode
  document.documentElement.dataset.theme = resolvedTheme
  document.documentElement.style.colorScheme = resolvedTheme

  return resolvedTheme
}

export function ThemeProvider({ children, initialMode = 'dark' }: { children: ReactNode; initialMode?: ThemeMode }) {
  const [mode, setModeState] = useState<ThemeMode>(initialMode)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(initialMode === 'system' ? 'dark' : initialMode)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const resolvedInitialTheme = applyTheme(initialMode)
    const timerId = window.setTimeout(() => {
      setModeState(initialMode)
      setResolvedTheme(resolvedInitialTheme)
    }, 0)

    return () => window.clearTimeout(timerId)
  }, [initialMode])

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
    startTransition(() => {
      void saveThemePreference(nextMode)
    })
  }, [startTransition])

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
