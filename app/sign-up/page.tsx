import Link from 'next/link'

import { Button, Card, Input, Label } from '@/components/ui'

import { signUp } from './actions'

interface SignUpPageProps {
  searchParams: Promise<{ error?: string }>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const { error } = await searchParams

  return (
    <main className="centered-page">
      <Card>
        <div className="stack">
          <div>
            <h1>Create your CRED account</h1>
            <p className="muted">Start by creating a secure email and password login.</p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <form action={signUp} className="form-stack">
            <div className="field-stack">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="field-stack">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <Button type="submit">Create account</Button>
          </form>
          <p className="muted">
            Already have an account? <Link href="/sign-in">Sign in</Link>.
          </p>
        </div>
      </Card>
    </main>
  )
}
