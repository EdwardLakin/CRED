import { existsSync } from 'node:fs'
import { join } from 'node:path'

import Image from 'next/image'
import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { PricingCheckoutButton } from '@/features/billing/components/PricingCheckoutButton'
import { getCurrentUser } from '@/features/auth/server'
import type { BillingPlan } from '@/features/billing'


type ProductScreenshotCardProps = {
  title: string
  eyebrow: string
  description: string
  src: string
  alt: string
  imagePosition?: string
  variant?: 'default' | 'wide' | 'before-after'
}

const workflowScreenshots: ProductScreenshotCardProps[] = [
  {
    title: 'Capture evidence',
    eyebrow: 'Capture',
    description:
      'Start a session and capture photos, forms, documents, voice notes, and text notes without choosing a workflow first.',
    src: '/marketing/cred/capture-page.png',
    alt: 'CRED capture page showing field evidence inputs in one session',
    imagePosition: 'top center',
  },
  {
    title: 'Review report',
    eyebrow: 'Review',
    description:
      'Review the finished report, correct details, and approve only what should be delivered.',
    src: '/marketing/cred/review-edit.png',
    alt: 'CRED review edit screen for correcting and approving a report',
  },
  {
    title: 'Keep evidence connected',
    eyebrow: 'Evidence context',
    description:
      'Supporting photos, notes, forms, and documents stay attached to the report sections they support.',
    src: '/marketing/cred/evidence-context.png',
    alt: 'CRED evidence context screen keeping evidence connected to report sections',
  },
  {
    title: 'Export documentation',
    eyebrow: 'Export',
    description:
      'Email, share, preview/print, or save the approved report.',
    src: '/marketing/cred/export-report.png',
    alt: 'CRED export report screen with delivery options after approval',
  },
]

function publicAssetExists(src: string) {
  return existsSync(join(process.cwd(), 'public', src.replace(/^\//, '')))
}

function ProductScreenshotCard({
  title,
  eyebrow,
  description,
  src,
  alt,
  imagePosition = 'center top',
  variant = 'default',
}: ProductScreenshotCardProps) {
  const hasScreenshot = publicAssetExists(src)

  return (
    <article className={`screenshot-card product-screenshot-card ${variant === 'wide' ? 'wide-card' : ''}`}>
      <div className="screenshot-copy">
        <span className="section-kicker">{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
      <div className="screenshot-frame">
        {hasScreenshot ? (
          <Image
            src={src}
            alt={alt}
            width={1280}
            height={900}
            className="screenshot-image"
            sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 540px"
            style={{ objectPosition: imagePosition }}
          />
        ) : (
          <div className="screenshot-placeholder" role="img" aria-label={`${alt} placeholder`}>
            <span>{eyebrow}</span>
            <strong>{title}</strong>
            <small>Add {src.replace('/marketing/cred/', '')} to show this product screenshot.</small>
          </div>
        )}
      </div>
    </article>
  )
}

function BeforeAfterScreenshot({
  src,
  alt,
  label,
  imagePosition,
}: {
  src: string
  alt: string
  label: string
  imagePosition?: string
}) {
  const hasScreenshot = publicAssetExists(src)

  return (
    <div className="before-after-screenshot">
      <span>{label}</span>
      <div className="screenshot-frame">
        {hasScreenshot ? (
          <Image
            src={src}
            alt={alt}
            width={1280}
            height={900}
            className="screenshot-image"
            sizes="(max-width: 760px) 100vw, 480px"
            style={{ objectPosition: imagePosition ?? 'center top' }}
          />
        ) : (
          <div className="screenshot-placeholder" role="img" aria-label={`${alt} placeholder`}>
            <strong>{label}</strong>
            <small>Add {src.replace('/marketing/cred/', '')}</small>
          </div>
        )}
      </div>
    </div>
  )
}

const steps = [
  ['Capture anything', 'Start a session and capture forms, photos, documents, voice notes, text notes, and field observations.'],
  ['CRED prepares the report', 'CRED organizes the captured material into professional documentation for review.'],
  ['Review and approve', 'Correct details, confirm what should be included, add signatures, and approve the report.'],
  ['Export documentation', 'Email, share a secure link, preview/print, or save the approved report.'],
] as const

const liveMetrics = [
  ['Session started', 'Active'],
  ['Form captured', 'Saved'],
  ['Photos saved', '12'],
  ['Voice note added', '1'],
  ['Report preparing', 'In progress'],
  ['Ready for review', 'Next'],
] as const

const reportPrepCapabilities = [
  'Use user-provided details from photos, notes, forms, documents, and observations',
  'Organize captured material into professional documentation',
  'Keep uploaded forms and source documents with the prepared report',
  'Prepare report sections from user-entered notes and evidence',
] as const

const reviewControls = [
  'Edit report title and summary',
  'Show or hide report sections',
  'Correct report fields',
  'Review evidence captions',
  'Verify form fields',
  'Approve before export',
] as const

const contextItems = [
  'Photos',
  'Field observations',
  'Voice notes',
  'Forms',
  'Documents',
  'Measurements',
  'Notes',
] as const

const reportOutputs = [
  'Executive summary',
  'Subject details',
  'Findings',
  'Recommended actions',
  'Supporting photos',
  'Source documents',
  'Signatures',
  'Email, share link, preview/print, save',
] as const

const useCases = [
  'Paper form digitization',
  'PM sheets and checklists',
  'Warranty and claim support',
  'Fleet maintenance records',
  'Compliance documentation',
  'Field service reports',
  'Asset condition reports',
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
    description: 'Capture-first documentation for independent technicians.',
    features: [
      '1 user',
      'Capture-first sessions',
      'Paper form and document capture',
      'Professional reports',
      'Human approval before export',
      'Email and share links',
    ],
  },
  {
    key: 'team',
    name: 'Team',
    price: '$129/month',
    description: 'Shared capture, review, and report history for growing field teams.',
    features: [
      'Up to 5 users',
      'Shared documentation sessions',
      'Team review workflow',
      'Report history',
      'Team workspace',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    price: '$249/month',
    description:
      'Built for teams that need branded, approved documentation across the shop.',
    features: [
      'Up to 15 users',
      'Everything in Team',
      'Shop branding',
      'Signatures and approval',
      'Shared report history',
      'Priority support',
    ],
  },
]

const faqs = [
  ['Who is CRED built for?', 'CRED is built for technicians, maintenance teams, and field organizations that want to replace paper with capture-first sessions and professional reports.'],
  ['Does CRED diagnose problems?', 'No. CRED organizes user-provided evidence and notes into documentation. Findings, recommendations, approval, certification, and sign-off remain with the user.'],
  ['What can I capture?', 'Capture forms, photos, documents, voice notes, text notes, measurements, and field observations in one session.'],
  ['Can I capture paper forms or reference documents?', 'Yes. Capture paper forms, labels, manuals, prior reports, reference documents, and job site context so CRED can keep them connected to the professional report.'],
  ['Can I review and edit before export?', 'Yes. CRED prepares a report from user-provided material, then you review details, correct sections, add signatures, and approve the documentation before export.'],
  ['Can I email, share, preview, print, or save?', 'Yes. Approved documentation can be emailed, shared by link, opened in a browser-friendly report for printing or saving as PDF, or saved for records.'],
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
          <p className="eyebrow">Evidence-first documentation platform</p>
          <h1>Capture anything. Generate everything.</h1>
          <p className="landing-hero-copy">
            Capture forms, photos, documents, voice notes, and field observations in one simple session. CRED turns messy field evidence into a professional report you can review, approve, and export.
          </p>
          <div className="workflow-pills" aria-label="CRED workflow">
            <span>Capture</span>
            <span>Review</span>
            <span>Approve</span>
            <span>Export</span>
          </div>
          <div className="landing-hero-actions">
            <Link href={isAuthenticated ? '/dashboard?checkout=individual' : '/sign-up?plan=individual'} className="button button-primary">
              Start Free Trial
            </Link>
            <Link href="/sign-in" className="button button-secondary">
              Sign In
            </Link>
          </div>
        </div>
        <div className="hero-product-card transformation-card" aria-label="Evidence to report transformation preview">
          <div className="mock-phone-header">
            <span />
            <strong>Evidence → Report</strong>
            <em>Human review</em>
          </div>
          <div className="evidence-flow">
            <div className="flow-column">
              <span className="flow-label">Inputs</span>
              <div className="input-chip">📸 Photo</div>
              <div className="input-chip">🎙 Voice Note</div>
              <div className="input-chip">📋 Form</div>
              <div className="input-chip">📄 Document</div>
            </div>
            <div className="flow-arrow" aria-hidden="true">→</div>
            <div className="flow-column ai-status-card">
              <span className="flow-label">Session status</span>
              <div><span>Form captured</span><strong>Saved</strong></div>
              <div><span>Photos saved</span><strong>12</strong></div>
              <div><span>Notes added</span><strong>Ready</strong></div>
              <div><span>Report preparing</span><strong>Now</strong></div>
              <div><span>Ready for review</span><strong>Next</strong></div>
            </div>
          </div>
          <div className="mock-report-output">
            <span className="flow-label">Output</span>
            <strong>Professional report ready for review</strong>
            <p>CRED organizes user-provided evidence and notes. A technician approves before export.</p>
          </div>
        </div>
      </section>

      <section className="landing-section workflow-screenshots-section" aria-labelledby="workflow-screenshots-title">
        <div className="section-kicker">Product workflow</div>
        <h2 id="workflow-screenshots-title">See the full workflow</h2>
        <p className="section-copy">
          CRED helps technicians start a session, capture field material, review the prepared report, approve it, and export final documentation.
        </p>
        <div className="screenshot-grid product-screenshot-grid">
          {workflowScreenshots.map((screenshot) => (
            <ProductScreenshotCard key={screenshot.title} {...screenshot} />
          ))}
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-kicker">How it works</div>
        <h2>Capture first. Review, approve, and export when ready.</h2>
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

      <section className="landing-section split-section">
        <div>
          <div className="section-kicker">Capture-first documentation</div>
          <h2>No setup. Just capture.</h2>
          <p className="section-copy">
            Start documenting immediately. Capture the form first if you have one, then add photos, notes, voice notes, and supporting documents.
          </p>
        </div>
        <div className="product-metric-card">
          {liveMetrics.map(([label, value]) => (
            <div className="metric-row" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section product-preview-section">
        <div className="section-kicker">Evidence-to-report preparation</div>
        <h2>CRED prepares a report from what you capture.</h2>
        <div className="screenshot-grid">
          <article className="screenshot-card wide-card">
            <div className="screenshot-topbar"><span /><span /><span /></div>
            <h3>Evidence organization</h3>
            <p>CRED organizes user-provided captures, notes, forms, and documents into a prepared report that is ready for review.</p>
            <div className="mock-list">
              {reportPrepCapabilities.map((capability) => (
                <div key={capability}>✓ {capability}</div>
              ))}
            </div>
          </article>
          <article className="screenshot-card review-card">
            <div className="screenshot-topbar"><span /><span /><span /></div>
            <h3>Human review remains in control</h3>
            <p>CRED prepares documentation from user-provided material. Technicians remain responsible for findings, recommendations, approval, and sign-off.</p>
            <div className="mock-list compact-list">
              {reviewControls.map((control) => (
                <div key={control}>✓ {control}</div>
              ))}
            </div>
            <div className="trust-line">CRED cannot diagnose, auto-approve, certify, or sign reports.</div>
          </article>
        </div>
      </section>

      <section className="landing-section split-section">
        <div>
          <div className="section-kicker">Evidence never loses context</div>
          <h2>Evidence stays connected to the report it supports.</h2>
          <p className="section-copy">
            Photos, notes, forms, documents, measurements, and observations stay organized with the report from capture through export.
          </p>
        </div>
        <div className="context-map-card">
          <strong>Report: Field documentation session</strong>
          <div className="context-node-grid">
            {contextItems.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section split-section report-ready-section">
        <div>
          <div className="section-kicker">Professional reports ready for delivery</div>
          <h2>Approved reports are built for customers, claims, compliance, and records.</h2>
          <p className="section-copy">
            Open the final documentation as a printable report, send it by email, share a link, print it, or save it with the job record.
          </p>
        </div>
        <div className="report-output-card">
          {reportOutputs.map((output) => (
            <div key={output}>✓ {output}</div>
          ))}
        </div>
      </section>

      <section className="landing-section featured-workflow-section" aria-labelledby="featured-workflow-title">
        <div className="section-kicker">Before and after</div>
        <h2 id="featured-workflow-title">From captured evidence to professional report</h2>
        <p className="section-copy">
          CRED assembles user-provided evidence and notes. Final review, approval, findings, recommendations, signatures, and certification remain with the user.
        </p>
        <div className="workflow-screenshot-strip" aria-label="Capture evidence becomes a human-reviewed professional report">
          <BeforeAfterScreenshot
            label="Captured evidence"
            src="/marketing/cred/capture-page.png"
            alt="CRED capture page with field evidence collected in one session"
            imagePosition="top center"
          />
          <div className="workflow-draft-arrow" aria-hidden="true">
            <span>→</span>
            <strong>Human-reviewed report</strong>
          </div>
          <BeforeAfterScreenshot
            label="Professional report"
            src="/marketing/cred/printable-report.png"
            alt="CRED printable professional report after user approval"
            imagePosition="top center"
          />
        </div>
      </section>

      <section className="landing-section split-section" id="use-cases">
        <div>
          <div className="section-kicker">Use cases</div>
          <h2>Built for documentation-heavy field work.</h2>
          <p className="section-copy">
            CRED supports teams replacing paper forms, scattered photos, and disconnected notes with professional field documentation.
          </p>
        </div>
        <div className="use-case-list">
          {useCases.map((useCase) => (
            <div className="use-case-pill" key={useCase}>✓ {useCase}</div>
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
