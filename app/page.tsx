import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { PricingCheckoutButton } from '@/features/billing/components/PricingCheckoutButton'
import { getCurrentUser } from '@/features/auth/server'
import type { BillingPlan } from '@/features/billing'

const steps = [
  ['Capture evidence', 'Photo and video intake optimized for technicians, inspectors, and field teams.'],
  ['Add voice/context', 'Attach narration, asset details, and field notes while work is still fresh.'],
  ['AI extracts details', 'Classify evidence and pull out defects, identifiers, observations, and next steps.'],
  ['Review/export report', 'Approve the structured documentation and export clean reports for stakeholders.'],
] as const

const useCases = [
  'CVIP / fleet inspections',
  'Mechanical inspections',
  'Property documentation',
  'Field service evidence',
  'Warranty/claim support',
] as const

const screenshots = [
  {
    title: 'Capture Evidence',
    detail: 'Mobile-first intake for photos, video clips, voice notes, and asset context.',
    rows: ['VIN plate photo', 'Brake chamber video', 'Technician voice note'],
  },
  {
    title: 'Evidence Review',
    detail: 'AI-assisted cards keep observations, classifications, and extracted details organized.',
    rows: ['Classification: mechanical', 'Severity: needs review', 'Extracted: axle 2 / air leak'],
  },
  {
    title: 'PDF Report',
    detail: 'Export professional documentation with reviewed evidence and a clear timeline.',
    rows: ['Executive summary', 'Evidence checklist', 'Findings with media references'],
  },
] as const

const plans: Array<{
  key: BillingPlan
  name: string
  price: string
  description: string
  features: string[]
}> = [
  {
    key: 'individual',
    name: 'Individual',
    price: '$39/month',
    description: 'AI-powered inspection documentation for independent technicians and inspectors.',
    features: [
      '1 user',
      'Unlimited inspections',
      'AI classification',
      'AI extraction',
      'PDF reports',
      'Mobile capture workflow',
    ],
  },
  {
    key: 'team',
    name: 'Team',
    price: '$99/month',
    description: 'Collaborative inspection platform for growing service and maintenance teams.',
    features: [
      'Up to 5 users',
      'Shared inspections',
      'Team reporting',
      'Organization dashboard',
      'Centralized evidence management',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    price: '$199/month',
    description:
      'Built for repair shops, fleet maintenance facilities, inspection companies, and service teams that need consistent, professional documentation across multiple technicians.',
    features: [
      'Up to 25 users',
      'Everything in Team',
      'Shared inspection library',
      'Team-wide evidence management',
      'AI-powered findings extraction',
      'Customer-ready PDF reports',
      'Shop branding and report customization',
      'Inspection history and audit trail',
      'Priority support',
    ],
  },
]

const faqs = [
  ['Who is CRED built for?', 'CRED is built for technicians, inspectors, fleet teams, mechanical shops, property teams, and service organizations that need defensible field documentation.'],
  ['What does the AI do?', 'AI helps classify captures, extract field details, summarize context, and prepare documentation for human review before export.'],
  ['Can I use CRED for CVIP and fleet inspections?', 'Yes. CRED is positioned for CVIP, fleet, mechanical, and warranty workflows where photo/video evidence and clean reporting matter.'],
  ['Do reports export to PDF?', 'Yes. Reviewed evidence can be assembled into clean documentation reports for customers, claims, compliance, and internal records.'],
] as const

export default async function HomePage() {
  const user = await getCurrentUser()
  const isAuthenticated = Boolean(user)

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <Link href="/" className="brand-mark" aria-label="CRED home">
          <span className="brand-icon">C</span>
          <span>
            <strong>CRED</strong>
            <small>by ProFixIQ</small>
          </span>
        </Link>
        <nav className="landing-nav-links" aria-label="Primary navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#use-cases">Use cases</a>
          <a href="#pricing">Pricing</a>
          <ThemeToggle />
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <p className="eyebrow">AI documentation for the field</p>
          <h1>Capture field evidence. Let AI build the report.</h1>
          <p className="landing-hero-copy">
            CRED helps inspection, CVIP, fleet, mechanical, property, and field documentation teams turn
            photo/video evidence, voice notes, and job context into clean, review-ready reports.
          </p>
          <div className="landing-hero-actions">
            <Link href={isAuthenticated ? '/dashboard?checkout=individual' : '/sign-up?plan=individual'} className="button button-primary">
              Start Free Trial
            </Link>
            <Link href="/sign-in" className="button button-secondary">
              Sign In
            </Link>
          </div>
        </div>
        <div className="hero-product-card" aria-label="CRED product preview">
          <div className="mock-phone-header">
            <span />
            <strong>Evidence Session</strong>
            <em>Live</em>
          </div>
          <div className="mock-capture-tile large">📸 Brake assembly photo captured</div>
          <div className="mock-capture-grid">
            <div>🎙 Voice note<br /><strong>42 sec</strong></div>
            <div>🤖 AI class<br /><strong>Mechanical</strong></div>
          </div>
          <div className="mock-report-strip">
            <span>Report readiness</span>
            <strong>86%</strong>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-kicker">How it works</div>
        <h2>From field capture to client-ready documentation.</h2>
        <div className="how-grid">
          {steps.map(([title, description], index) => (
            <article className="landing-card" key={title}>
              <span className="step-number">0{index + 1}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section split-section" id="use-cases">
        <div>
          <div className="section-kicker">Use cases</div>
          <h2>Built for evidence-heavy work where details matter.</h2>
          <p className="section-copy">
            CRED keeps teams aligned when documentation needs to support inspections, approvals, claims,
            warranties, customer communication, and internal quality control.
          </p>
        </div>
        <div className="use-case-list">
          {useCases.map((useCase) => (
            <div className="use-case-pill" key={useCase}>✓ {useCase}</div>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="section-kicker">Product preview</div>
        <h2>Capture, review, and export in one workflow.</h2>
        <div className="screenshot-grid">
          {screenshots.map((screenshot) => (
            <article className="screenshot-card" key={screenshot.title}>
              <div className="screenshot-topbar"><span /><span /><span /></div>
              <h3>{screenshot.title}</h3>
              <p>{screenshot.detail}</p>
              <div className="mock-list">
                {screenshot.rows.map((row) => (
                  <div key={row}>{row}</div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section" id="pricing">
        <div className="section-kicker">Pricing</div>
        <h2>Start small. Scale documentation across the team.</h2>
        <div className="pricing-grid">
          {plans.map((plan) => (
            <article className={`pricing-card ${plan.key === 'team' ? 'featured-plan' : ''}`} key={plan.key}>
              {plan.key === 'team' ? <span className="plan-badge">Most popular</span> : null}
              <h3>{plan.name}</h3>
              <p className="plan-price">{plan.price}</p>
              <p className="muted">{plan.description}</p>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>✓ {feature}</li>
                ))}
              </ul>
              <PricingCheckoutButton plan={plan.key} isAuthenticated={isAuthenticated}>
                Start {plan.name}
              </PricingCheckoutButton>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section faq-section">
        <div className="section-kicker">FAQ</div>
        <h2>Questions before you capture?</h2>
        <div className="faq-grid">
          {faqs.map(([question, answer]) => (
            <details className="faq-item" key={question}>
              <summary>{question}</summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="landing-footer">
        <div>
          <strong>CRED by ProFixIQ</strong>
          <p>Capture, Review, Extract, Document.</p>
        </div>
        <div className="footer-links">
          <a href="#pricing">Pricing</a>
          <Link href="/sign-in">Sign in</Link>
          <Link href="/sign-up">Start free trial</Link>
        </div>
      </footer>
    </main>
  )
}
