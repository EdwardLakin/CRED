import { redirect } from 'next/navigation'

import { ThemeToggle } from '@/components/theme'
import { Button, Card, Input, Label } from '@/components/ui'
import { getCurrentProfile, requireUser } from '@/features/auth/server'
import { isBillingPlan } from '@/features/billing'
import { completeOnboarding } from './actions'

const industries = [
  'Heavy Duty / Fleet',
  'Automotive',
  'Construction',
  'Electrician',
  'HVAC',
  'Plumbing',
  'Home Inspector',
  'Property Management',
  'Insurance / Claims',
  'Other',
] as const

interface OnboardingPageProps {
  searchParams: Promise<{ error?: string; plan?: string }>
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const { error, plan: planValue } = await searchParams
  const plan = isBillingPlan(planValue) ? planValue : null

  await requireUser()
  const profile = await getCurrentProfile()

  if (profile) {
    redirect(plan ? `/dashboard?checkout=${plan}` : '/dashboard')
  }

  return (
    <main className="centered-page">
      <Card>
        <div className="auth-card-header">
          <ThemeToggle />
        </div>
        <div className="stack">
          <div>
            <h1>Set up your workspace</h1>
            <p className="muted">Tell us who you are and what kind of documentation your team creates.</p>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <form action={completeOnboarding} className="form-stack">
            {plan ? <input type="hidden" name="plan" value={plan} /> : null}
            <div className="field-stack">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" autoComplete="name" required />
            </div>
            <div className="field-stack">
              <Label htmlFor="companyName">Company name</Label>
              <Input id="companyName" name="companyName" autoComplete="organization" required />
            </div>
            <div className="field-stack">
              <Label htmlFor="industry">Industry</Label>
              <select className="select" id="industry" name="industry" required defaultValue="">
                <option disabled value="">
                  Select an industry
                </option>
                {industries.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit">Finish setup</Button>
          </form>
        </div>
      </Card>
    </main>
  )
}
