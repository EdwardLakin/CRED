import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
}

export function Button({ className = '', variant = 'primary', ...props }: ButtonProps) {
  const variantClass = variant === 'primary' ? 'button button-primary' : 'button button-secondary'

  return <button className={`${variantClass} ${className}`.trim()} {...props} />
}
