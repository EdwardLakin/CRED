import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { PricingCheckoutButton } from '@/features/billing/components/PricingCheckoutButton'
import { getCurrentUser } from '@/features/auth/server'
import type { BillingPlan } from '@/features/billing'

const steps = [
  ['New Session', 'Press once and start capturing immediately. No setup required.'],
  ['Capture Evidence', 'Use camera, gallery, voice notes, or text notes in any order.'],
  ['Review', 'CRED turns the captured evidence into a professional report.'],
  ['Export', 'Approve, then email, share, print, or save the report.'],
] as const

const useCases = [
  'Paper form replacement',
  'Fleet and service documentation',
  'Property documentation',
  'Field service evidence',
  'Warranty/claim support',
] as const

const screenshots = [
  {
    title: 'Capture Evidence',
    detail: 'The capture screen is the product: camera, gallery, voice note, and text note.',
    rows: ['Paper form photo', 'Job site photo', 'Technician voice note'],
  },
  {
    title: 'Review',
    detail: 'A professional report appears from the evidence, ready for technician review.',
    rows: ['Findings', 'Recommendations', 'Photos and notes'],
  },
  {
    title: 'Printable Report',
    detail: 'Group final actions under one clear export experience.',
    rows: ['Email', 'Share link', 'Print / Save'],
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
    description: 'Paper replacement for independent technicians.',
    features: [
      '1 user',
      'Unlimited sessions',
      'Automatic report building',
      'Paper form capture',
      'Printable reports',
      'Mobile evidence capture',
    ],
  },
  {
    key: 'team',
    name: 'Team',
    price: '$99/month',
    description: 'Shared paper replacement for growing service and maintenance teams.',
    features: [
      'Up to 5 users',
      'Shared sessions',
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
      'Built for teams that want technicians to capture evidence quickly while CRED builds consistent, professional reports.',
    features: [
      'Up to 25 users',
      'Everything in Team',
      'Shared report history',
      'Team-wide evidence management',
      'Automatic findings and recommendations',
      'Customer-ready printable reports',
      'Shop branding and report customization',
      'Session history and audit trail',
      'Priority support',
    ],
  },
]

const faqs = [
  ['Who is CRED built for?', 'CRED is built for technicians and field teams that want to replace paper forms with fast evidence capture and professional reports.'],
  ['What does CRED build?', 'CRED turns captured evidence into findings, recommendations, form fields, photos, notes, and report structure for human review.'],
  ['Can I capture a paper form?', 'Yes. If you have a paper form, capture it first. The form provides context for the report.'],
  ['Can I save reports as PDF?', 'Yes. CRED opens polished printable reports that you can save from your browser’s Print or Share menu for customers, claims, regulated documentation packages, and internal records.'],
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
          <p className="eyebrow">Paper replacement for the field</p>
          <h1>Capture anything. Generate everything.</h1>
          <p className="landing-hero-copy">
            The technician captures evidence. CRED builds the professional report. No setup required.
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
            <div>✍️ Text note<br /><strong>Ready</strong></div>
          </div>
          <div className="mock-report-strip">
            <span>Report</span>
            <strong>Ready</strong>
          </div>
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-kicker">How it works</div>
        <h2>From first capture to finished report.</h2>
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
          <h2>Built for teams replacing paper in the field.</h2>
          <p className="section-copy">
            CRED keeps capture simple while creating reports that support approvals, claims, warranties, customer communication, and internal quality control.
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
        <h2>Capture, review, and export without configuration.</h2>
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
        <h2>Start capturing in under a minute. Scale across the team.</h2>
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
          <p>Capture anything. Generate everything.</p>
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
