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
      'Photos, documents, voice notes, and text notes are captured in one session while CRED tracks readiness and missing evidence.',
    src: '/marketing/cred/capture-page.png',
    alt: 'CRED capture page showing evidence inputs and readiness tracking',
    imagePosition: 'top center',
  },
  {
    title: 'Review and correct',
    eyebrow: 'Review',
    description:
      'Generated sections, extracted fields, recommendations, and evidence captions remain editable before approval.',
    src: '/marketing/cred/review-edit.png',
    alt: 'CRED review edit screen with editable generated report content',
  },
  {
    title: 'Keep evidence connected',
    eyebrow: 'Evidence context',
    description:
      'Photos, notes, documents, measurements, and recommendations stay linked to the finding they support.',
    src: '/marketing/cred/evidence-context.png',
    alt: 'CRED evidence context screen linking evidence to findings',
  },
  {
    title: 'Export the report',
    eyebrow: 'Export',
    description:
      'Email, share, print, save, or export a professional report after human approval.',
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
  ['Capture evidence', 'Photos, forms, documents, voice notes, measurements, and field observations enter one evidence-first session.'],
  ['AI organizes and drafts', 'CRED extracts context, groups evidence, identifies findings, and drafts structured documentation.'],
  ['Human reviews and approves', 'Technicians edit, verify, show or hide sections, and approve what appears in the final report.'],
  ['Export professional report', 'Deliver approved documentation as PDF, email, share link, print, or saved record.'],
] as const

const liveMetrics = [
  ['Inspection completeness', '78%'],
  ['Evidence completeness', '84%'],
  ['Finding confidence', 'Review'],
  ['Report readiness', 'Drafting'],
  ['Missing required evidence', 'Panel serial photo'],
  ['Suggested next capture', 'Voice note on corrective action'],
] as const

const aiDraftCapabilities = [
  'Extract details from photos, notes, forms, documents, and observations',
  'Organize and group related evidence under findings',
  'Reconstruct form and document structure for review',
  'Prepare draft summaries, recommendations, and report sections',
] as const

const reviewControls = [
  'Edit report title and summary',
  'Show or hide report sections',
  'Correct extracted fields',
  'Review evidence captions',
  'Verify form fields',
  'Approve before export',
] as const

const contextItems = [
  'Photos',
  'Technician observations',
  'Voice notes',
  'Documents',
  'Measurements',
  'Recommendations',
  'Reference captures',
] as const

const reportOutputs = [
  'Inspection summary',
  'Findings',
  'Recommended actions',
  'Reference documents',
  'Inspector and facility details',
  'Signatures',
  'Export as PDF',
  'Email, share link, print, or save',
] as const

const useCases = [
  'Inspections',
  'Diagnostic documentation',
  'Warranty/claim support',
  'Fleet maintenance documentation',
  'Compliance records',
  'Field service evidence',
  'Property or asset documentation',
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
    description: 'Evidence-first documentation workflow for independent technicians.',
    features: [
      '1 user',
      'Unlimited evidence sessions',
      'AI-assisted draft reports',
      'Paper form and document capture',
      'Human approval before export',
      'PDF, print, email, and share-ready reports',
    ],
  },
  {
    key: 'team',
    name: 'Team',
    price: '$99/month',
    description: 'Shared capture, review, and report workflow for growing field teams.',
    features: [
      'Up to 5 users',
      'Shared documentation sessions',
      'Team reporting workflow',
      'Organization dashboard',
      'Centralized evidence and context management',
    ],
  },
  {
    key: 'shop',
    name: 'Shop',
    price: '$199/month',
    description:
      'Built for teams that want technicians to capture messy field evidence while CRED prepares consistent, professional reports for review.',
    features: [
      'Up to 25 users',
      'Everything in Team',
      'Shared report history',
      'Team-wide evidence management',
      'Draft findings and recommendations',
      'Customer-ready professional reports',
      'Shop branding and report customization',
      'Session history and audit trail',
      'Priority support',
    ],
  },
]

const faqs = [
  ['Who is CRED built for?', 'CRED is built for technicians, inspectors, maintenance teams, and field organizations that need evidence-first documentation and professional reports without turning every job into paperwork.'],
  ['Does CRED diagnose problems?', 'No. CRED assists with evidence organization and documentation. Final diagnosis, approval, certification, and signing remain with the user or technician.'],
  ['What evidence can I capture?', 'Capture photos, voice notes, text observations, forms, documents, measurements, reference captures, and recommendations in one session.'],
  ['Can I capture paper forms or reference documents?', 'Yes. Capture paper forms, labels, manuals, prior reports, reference documents, and job site context so CRED can keep them connected to the draft documentation.'],
  ['Can I review and edit before export?', 'Yes. CRED drafts the documentation, then humans review titles, summaries, sections, captions, fields, findings, and recommendations before approval.'],
  ['Can I save reports as PDF or share them?', 'Yes. Approved reports can be exported as PDF, emailed, shared by link, printed, or saved for customers, claims, compliance packages, and internal records.'],
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
            Capture photos, forms, documents, voice notes, and field observations. CRED organizes the evidence, drafts structured documentation, and prepares professional reports for human review and export.
          </p>
          <div className="workflow-pills" aria-label="CRED workflow">
            <span>Capture evidence</span>
            <span>AI drafts</span>
            <span>Human approves</span>
            <span>Export report</span>
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
              <span className="flow-label">AI draft status</span>
              <div><span>Evidence completeness</span><strong>84%</strong></div>
              <div><span>Finding confidence</span><strong>Review</strong></div>
              <div><span>Report readiness</span><strong>Draft ready</strong></div>
            </div>
          </div>
          <div className="mock-report-output">
            <span className="flow-label">Output</span>
            <strong>Approved professional inspection report</strong>
            <p>AI assists with organization and drafting. A technician approves before export.</p>
          </div>
        </div>
      </section>

      <section className="landing-section workflow-screenshots-section" aria-labelledby="workflow-screenshots-title">
        <div className="section-kicker">Product workflow</div>
        <h2 id="workflow-screenshots-title">See the full workflow</h2>
        <p className="section-copy">
          CRED captures messy field evidence, turns it into a review-ready draft, keeps every finding tied to its source, and exports a professional report.
        </p>
        <div className="screenshot-grid product-screenshot-grid">
          {workflowScreenshots.map((screenshot) => (
            <ProductScreenshotCard key={screenshot.title} {...screenshot} />
          ))}
        </div>
      </section>

      <section className="landing-section" id="how-it-works">
        <div className="section-kicker">Workflow</div>
        <h2>From messy field evidence to review-ready documentation.</h2>
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
          <div className="section-kicker">Live documentation while you work</div>
          <h2>Progress updates as evidence is captured.</h2>
          <p className="section-copy">
            CRED shows what is complete, what still needs support, and what to capture next while the job is still fresh.
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
        <div className="section-kicker">AI-assisted draft generation</div>
        <h2>CRED organizes the evidence into a structured draft.</h2>
        <div className="screenshot-grid">
          <article className="screenshot-card wide-card">
            <div className="screenshot-topbar"><span /><span /><span /></div>
            <h3>Evidence extraction and grouping</h3>
            <p>CRED can extract, organize, group evidence, reconstruct form/document structure, identify findings, and prepare recommendations for review.</p>
            <div className="mock-list">
              {aiDraftCapabilities.map((capability) => (
                <div key={capability}>✓ {capability}</div>
              ))}
            </div>
          </article>
          <article className="screenshot-card review-card">
            <div className="screenshot-topbar"><span /><span /><span /></div>
            <h3>Human review remains in control</h3>
            <p>CRED drafts the documentation. Technicians decide what appears in the final report.</p>
            <div className="mock-list compact-list">
              {reviewControls.map((control) => (
                <div key={control}>✓ {control}</div>
              ))}
            </div>
            <div className="trust-line">AI cannot auto-approve, certify, or sign reports.</div>
          </article>
        </div>
      </section>

      <section className="landing-section split-section">
        <div>
          <div className="section-kicker">Evidence never loses context</div>
          <h2>Every capture stays connected to the finding it supports.</h2>
          <p className="section-copy">
            Photos, notes, documents, measurements, reference captures, technician observations, and recommendations remain tied to the relevant finding from capture through export.
          </p>
        </div>
        <div className="context-map-card">
          <strong>Finding: Leaking hydraulic fitting</strong>
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
            Export the final documentation as a PDF, send it by email, share a link, print it, or save it with the job record.
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
          AI assists with extraction, organization, and drafting. Final review, approval, signatures, and certification remain with the user.
        </p>
        <div className="workflow-screenshot-strip" aria-label="Capture evidence becomes an AI-assisted draft and then a professional report">
          <BeforeAfterScreenshot
            label="Captured evidence"
            src="/marketing/cred/capture-page.png"
            alt="CRED capture page with field evidence collected in one session"
            imagePosition="top center"
          />
          <div className="workflow-draft-arrow" aria-hidden="true">
            <span>→</span>
            <strong>AI-assisted draft</strong>
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
            CRED supports the teams that need complete evidence, accountable human review, and professional report delivery after every job.
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
