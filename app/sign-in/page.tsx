import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { Button, Card, Input, Label } from '@/components/ui'
import { parseBillingPlan } from '@/features/billing'

import { signIn } from './actions'

interface SignInPageProps {
  searchParams: Promise<{ error?: string; message?: string; plan?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, message, plan: planValue } = await searchParams
  const plan = parseBillingPlan(planValue)

  return (
    <main className="centered-page">
      <Card>
        <div className="auth-card-header">
          <ThemeToggle />
        </div>
        <div className="stack">
          <div>
            <h1>Sign in to CRED</h1>
            <p className="muted">Use your email and password to continue.</p>
          </div>
          {message ? <p className="muted">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <form action={signIn} className="form-stack">
            {plan ? <input type="hidden" name="plan" value={plan} /> : null}
            <div className="field-stack">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field-stack">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit">Sign in</Button>
          </form>
          <p className="muted">
            New to CRED? <Link href={plan ? `/sign-up?plan=${plan}` : '/sign-up'}>Create an account</Link>.
          </p>
        </div>
      </Card>
    </main>
  )
}
