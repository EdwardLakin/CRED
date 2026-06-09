import Link from 'next/link'

import { Button, Card, Input, Label } from '@/components/ui'

import { signIn } from './actions'

interface SignInPageProps {
  searchParams: Promise<{ error?: string; message?: string }>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, message } = await searchParams

  return (
    <main className="centered-page">
      <Card>
        <div className="stack">
          <div>
            <h1>Sign in to CRED</h1>
            <p className="muted">Use your email and password to continue.</p>
          </div>
          {message ? <p className="muted">{message}</p> : null}
          {error ? <p className="error">{error}</p> : null}
          <form action={signIn} className="form-stack">
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
            New to CRED? <Link href="/sign-up">Create an account</Link>.
          </p>
        </div>
      </Card>
    </main>
  )
}
