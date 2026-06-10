'use client'

import { useId } from 'react'

import { type ThemeMode, useTheme } from './ThemeProvider'

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

export function ThemeToggle({ className = '' }: { className?: string }) {
  const { mode, resolvedTheme, setMode } = useTheme()
  const labelId = useId()

  return (
    <div className={`theme-toggle ${className}`.trim()} aria-labelledby={labelId}>
      <span id={labelId} className="theme-toggle-label">
        Theme
      </span>
      <div className="theme-toggle-options" role="group" aria-label={`Theme mode. Current theme is ${mode}, showing ${resolvedTheme}.`}>
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className="theme-toggle-option touch-target"
            aria-pressed={mode === option.value}
            onClick={() => setMode(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
