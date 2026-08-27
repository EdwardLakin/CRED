import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

import { ThemeToggle } from '@/components/theme'
import { PricingCheckoutButton } from '@/features/billing/components/PricingCheckoutButton'
import { getCurrentUser } from '@/features/auth/server'
import { PUBLIC_CRED_PLANS, PUBLIC_FEATURE_COMPARISON } from '@/features/billing/public-plans'
import { CRED_TIER_LABELS, type CredTier } from '@/features/billing/feature-gates'

export const metadata: Metadata = {
  title: 'CRED | Turn field documentation into professional reports',
  description:
    'CRED turns photos, forms, notes, and documents into professional reports for field teams, claims professionals, and complex investigations.',
  openGraph: {
    title: 'CRED | Field documentation to professional reports',
    description:
      'Capture photos, forms, notes, and documents in one session. Review, approve, share, and export professional documentation.',
  },
}

type ProductScreenshotCardProps = {
  title: string
  eyebrow: string
  description: string
  src: string
  alt: string
  imagePosition?: string
}

const essentialsScreenshots: ProductScreenshotCardProps[] = [
  { title: 'Capture sessions', eyebrow: 'Capture', description: 'Collect photos, forms, documents, voice notes, and text notes in one field session.', src: '/marketing/cred/capture-page.png', alt: 'CRED capture session for photos forms documents and notes', imagePosition: 'top center' },
  { title: 'Items', eyebrow: 'Items', description: 'Keep captured items organized so reviewers can see what supports the report.', src: '/marketing/cred/evidence-library.png', alt: 'CRED Items view showing organized source material' },
  { title: 'Review report', eyebrow: 'Review', description: 'Review the prepared report, correct details, add signatures, and approve before delivery.', src: '/marketing/cred/review-edit.png', alt: 'CRED report review and approval screen' },
  { title: 'Export', eyebrow: 'Export', description: 'Email, share securely, print, or save the approved documentation.', src: '/marketing/cred/export-report.png', alt: 'CRED report export and secure sharing options' },
]

const tierScreenshots: Record<CredTier, ProductScreenshotCardProps[]> = {
  essentials: essentialsScreenshots.slice(0, 2),
  professional: [
    { title: 'Advanced Review', eyebrow: 'Professional', description: 'Process unresolved items and suggestions in a structured review workflow.', src: '/marketing/cred/review-queue.png', alt: 'CRED Advanced Review for complex item review' },
    { title: 'Timeline and observations', eyebrow: 'Professional', description: 'Organize dated events, factual observations, suggestions, and additional outputs.', src: '/marketing/cred/timeline-observations.png', alt: 'CRED Timeline and Factual Observations workspace' },
  ],
  investigation: [
    { title: 'Entities', eyebrow: 'Investigation', description: 'Organize people, places, assets, and organizations in an investigation workspace.', src: '/marketing/cred/entities.png', alt: 'CRED Entities workspace for investigation source organization' },
    { title: 'Connections', eyebrow: 'Investigation', description: 'Explore links between items, events, entities, observations, and outputs.', src: '/marketing/cred/relationship-explorer.png', alt: 'CRED Connections view showing related sources' },
  ],
}

const workflowSteps = [
  ['Capture', 'Start a session and capture user-provided photos, forms, notes, documents, and observations.'],
  ['Review', 'CRED organizes the material into documentation your team can inspect and edit.'],
  ['Approve', 'People remain responsible for findings, recommendations, signatures, and sign-off.'],
  ['Export', 'Share, email, print, save as PDF, or keep the approved report with the workspace record.'],
] as const

const tierProgression = [
  ['Document', 'CRED Essentials', ['Capture', 'Report', 'Approve', 'Export']],
  ['Organize', 'CRED Professional', ['Advanced Review', 'Timeline', 'Observations', 'Additional Outputs']],
  ['Investigate', 'CRED Investigation', ['Entities', 'Connections', 'Source linking', 'Investigation packages']],
] as const

const useCasesByTier = [
  ['Essentials use cases', ['service reports', 'repair documentation', 'vehicle and asset inspections', 'property walkthroughs', 'preventive-maintenance records', 'warranty support', 'field-service documentation']],
  ['Professional use cases', ['claims documentation', 'compliance reviews', 'multi-stage inspections', 'condition histories', 'structured source review', 'team-based report preparation']],
  ['Investigation use cases', ['legal documentation packages', 'insurance investigations', 'dispute documentation', 'forensic case files', 'expert-witness documentation', 'connection and chronology analysis']],
] as const

const faqs = [
  ['What is the difference between Essentials, Professional, and Investigation?', 'Essentials is a complete documentation product for capture, report review, approval, and export. Professional adds Advanced Review, timelines, observations, suggestions, and additional outputs. Investigation adds entities, connections, source linking, and investigation outputs.'],
  ['Can I add more users?', 'Yes. Each plan includes a seat allowance, and additional seats are available for teams that need more active workspace members.'],
  ['How do included seats work?', 'Seat limits apply to active workspace members. Essentials includes 3 seats, Professional includes 10 seats, and Investigation includes 20 seats.'],
  ['Are discounted user packs available?', 'User-pack pricing is planned for account billing. Contact us for larger teams while pack checkout is not yet exposed on the public page.'],
  ['Can a company manage multiple shops, offices, or teams?', 'Yes. Use one workspace for each team, shop, office, or location so users, sessions, reports, and items stay scoped together.'],
  ['Can I upgrade later?', 'Yes. Checkout uses the current billing plans, and upgrading unlocks the higher-tier workspace tools associated with that plan.'],
  ['Are investigation tools included in Essentials?', 'No. Essentials focuses on documentation. Investigation tools such as Entities and Connections are available in CRED Investigation.'],
  ['Does CRED provide legal advice or make findings?', 'No. CRED organizes user-provided material. It does not diagnose, provide legal advice, certify findings automatically, or replace human review and sign-off.'],
  ['Can technicians use CRED without the investigation tools?', 'Yes. Essentials is designed as a complete workflow for technicians, shops, inspectors, contractors, and field-service teams.'],
  ['What happens to existing reports when I upgrade or downgrade?', 'Existing reports remain part of the workspace record. Higher-tier gated tools become available when the workspace has access; gated tools are not represented here as deleting data on downgrade.'],
] as const

function publicAssetExists(src: string) {
  return existsSync(join(process.cwd(), 'public', src.replace(/^\//, '')))
}

function ProductScreenshotCard({ title, eyebrow, description, src, alt, imagePosition = 'center top' }: ProductScreenshotCardProps) {
  const hasScreenshot = publicAssetExists(src)
  return (
    <article className="screenshot-card product-screenshot-card">
      <div className="screenshot-copy"><span className="section-kicker">{eyebrow}</span><h3>{title}</h3><p>{description}</p></div>
      <div className="screenshot-frame">
        {hasScreenshot ? <Image src={src} alt={alt} width={1280} height={900} className="screenshot-image" sizes="(max-width: 760px) 100vw, (max-width: 1180px) 50vw, 540px" style={{ objectPosition: imagePosition }} /> : (
          <div className="screenshot-placeholder" role="img" aria-label={`${alt} placeholder`}><span>{eyebrow}</span><strong>{title}</strong><small>Add {src.replace('/marketing/cred/', '')} to show this product screenshot.</small></div>
        )}
      </div>
    </article>
  )
}

function CheckMark({ value }: { value: boolean | string }) {
  return <span className={value === true ? 'comparison-yes' : value ? 'comparison-text' : 'comparison-no'}>{value === true ? '✓' : value || '—'}</span>
}

export default async function HomePage() {
  const user = await getCurrentUser()
  const isAuthenticated = Boolean(user)

  return (
    <main className="landing-shell">
      <header className="landing-nav">
        <Link href="/" className="brand-mark" aria-label="CRED home"><span className="brand-icon">C</span><span><strong>CRED</strong><small>by ProFixIQ</small></span></Link>
        <nav className="landing-nav-links" aria-label="Primary navigation">
          <a href="#workflow">Workflow</a>
          <a href="#tiers">Plans</a>
          <a href="#use-cases">Use cases</a>
          <a href="#pricing">Pricing</a>
          {isAuthenticated ? (
            <a href="/dashboard">Dashboard</a>
          ) : (
            <Link href="/sign-in">Sign in</Link>
          )}
          <ThemeToggle />
        </nav>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-content">
          <p className="eyebrow">Documentation-first reporting platform</p>
          <h1>Turn field documentation into professional reports.</h1>
          <p className="landing-hero-copy">Capture photos, forms, notes, and documents in one session. CRED organizes everything into documentation your team can review, approve, share, and export.</p>
          <div className="workflow-pills" aria-label="CRED workflow"><span>Capture</span><span>Review</span><span>Approve</span><span>Export</span></div>
          <p className="hero-copy-guardrail">CRED organizes user-provided material. It does not diagnose, certify findings automatically, or replace your team’s review, recommendations, and sign-off.</p>
          <div className="landing-hero-actions">{isAuthenticated ? (
              <a href="/dashboard?checkout=individual" className="button button-primary">
                Open CRED
              </a>
            ) : (
              <Link href="/sign-up?plan=individual" className="button button-primary">
                Start with Essentials
              </Link>
            )}<a href="#pricing" className="button button-secondary">Compare plans</a></div>
        </div>
        <div className="hero-product-card transformation-card" aria-label="Items to report transformation preview">
          <div className="mock-phone-header"><span /><strong>Capture → Report</strong><em>Human review</em></div>
          <div className="evidence-flow"><div className="flow-column"><span className="flow-label">Inputs</span><div className="input-chip">📸 Photos</div><div className="input-chip">📋 Forms</div><div className="input-chip">🎙 Notes</div><div className="input-chip">📄 Documents</div></div><div className="flow-arrow" aria-hidden="true">→</div><div className="flow-column ai-status-card"><span className="flow-label">Workspace</span><div><span>Items</span><strong>Saved</strong></div><div><span>Report</span><strong>Review</strong></div><div><span>Approval</span><strong>Required</strong></div><div><span>Export</span><strong>Ready</strong></div></div></div>
          <div className="mock-report-output"><span className="flow-label">Output</span><strong>Professional report ready for approval</strong><p>Simple for Essentials teams. Structured for Professional and Investigation teams when they need more.</p></div>
        </div>
      </section>

      <section className="landing-section" id="workflow"><div className="section-kicker">Simple workflow</div><h2>Capture → Review → Approve → Export</h2><div className="how-grid">{workflowSteps.map(([title, description], index) => <article className="landing-card" key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{description}</p></article>)}</div></section>

      <section className="landing-section workflow-screenshots-section" aria-labelledby="essentials-screenshots-title"><div className="section-kicker">Essentials workflow</div><h2 id="essentials-screenshots-title">A complete product for field documentation.</h2><p className="section-copy">Essentials keeps the Capture, Review, Approve, and Export path clear from start to finish.</p><div className="screenshot-grid product-screenshot-grid">{essentialsScreenshots.map((screenshot) => <ProductScreenshotCard key={screenshot.title} {...screenshot} />)}</div></section>

      <section className="landing-section" id="tiers"><div className="section-kicker">Choose how far you need to go</div><h2>Start with documentation. Expand into review and investigation.</h2><div className="tier-progression-grid">{tierProgression.map(([stage, plan, items]) => <article className="landing-card tier-progression-card" key={plan}><span className="section-kicker">{stage}</span><h3>{plan}</h3><ul>{items.map((item) => <li key={item}>✓ {item}</li>)}</ul></article>)}</div></section>

      {PUBLIC_CRED_PLANS.map((plan) => <section className="landing-section tier-product-section" key={plan.billingKey}><div><div className="section-kicker">{plan.shortName}</div><h2>{plan.name}</h2><p className="section-copy">{plan.description}</p><p className="muted"><strong>Best for:</strong> {plan.audience}</p><div className="feature-chip-grid">{plan.highlightedFeatures.map((feature) => <span key={feature}>✓ {feature}</span>)}</div></div><div className="screenshot-grid tier-screenshot-grid">{tierScreenshots[plan.tier].map((screenshot) => <ProductScreenshotCard key={screenshot.title} {...screenshot} />)}</div></section>)}

      <section className="landing-section" id="use-cases"><div className="section-kicker">Use cases</div><h2>Use the tier that matches the work.</h2><div className="use-case-tier-grid">{useCasesByTier.map(([title, cases]) => <article className="landing-card" key={title}><h3>{title}</h3><div className="use-case-list">{cases.map((useCase) => <div className="use-case-pill" key={useCase}>✓ {useCase}</div>)}</div></article>)}</div></section>

      <section className="landing-section split-section workspace-section"><div><div className="section-kicker">Workspaces, teams, shops, and offices</div><h2>One workspace for each team, shop, office, or location.</h2><p className="section-copy">A workspace keeps its users, sessions, reports, and items scoped together. Shops or companies with multiple locations can use separate workspaces, and legal or investigation firms can separate teams, offices, or matters according to the supported organization model.</p></div><div className="workspace-card"><strong>Workspace controls</strong><p>Owners and admins manage users and billing. Seat limits apply to active workspace members. Additional users can be added beyond the included allowance.</p><p>Need more users? Add seats individually or save with discounted user packs when account billing supports pack checkout. Contact us for larger teams.</p></div></section>

      <section className="landing-section" id="pricing"><div className="section-kicker">Pricing</div><h2>Start with Essentials. Expand when the workflow needs it.</h2><div className="pricing-grid">{PUBLIC_CRED_PLANS.map((plan) => <article className={`pricing-card ${plan.featured ? 'featured-plan' : ''}`} key={plan.billingKey}>{plan.featured ? <span className="plan-badge">Best starting point</span> : null}<h3>{plan.name}</h3><p className="plan-price">{plan.priceLabel}</p><p className="seat-count">{plan.includedSeats} included seats</p><p className="muted">{plan.description}</p><ul>{plan.highlightedFeatures.map((feature) => <li key={feature}>✓ {feature}</li>)}<li>✓ Additional seats available</li><li>✓ User-pack pricing coming with account billing</li></ul><PricingCheckoutButton plan={plan.billingKey} isAuthenticated={isAuthenticated}>Start {plan.shortName}</PricingCheckoutButton></article>)}</div><p className="pricing-note">Current checkout uses the existing Stripe billing products behind the legacy keys. Seat-pack purchase buttons are not shown until real Stripe prices are configured.</p></section>

      <section className="landing-section comparison-section" aria-labelledby="comparison-title"><div className="section-kicker">Feature comparison</div><h2 id="comparison-title">Compare the CRED tiers.</h2><div className="comparison-table" role="table" aria-label="CRED feature comparison"><div className="comparison-row comparison-header" role="row"><div role="columnheader">Feature</div>{PUBLIC_CRED_PLANS.map((plan) => <div role="columnheader" key={plan.tier}>{CRED_TIER_LABELS[plan.tier]}</div>)}</div>{PUBLIC_FEATURE_COMPARISON.map((row) => <div className="comparison-row" role="row" key={row.label}><div role="rowheader">{row.label}</div><div><CheckMark value={row.values.essentials} /></div><div><CheckMark value={row.values.professional} /></div><div><CheckMark value={row.values.investigation} /></div></div>)}</div><div className="mobile-comparison-cards" aria-label="Mobile CRED feature comparison">{PUBLIC_CRED_PLANS.map((plan) => <article className="landing-card" key={plan.tier}><h3>{plan.name}</h3>{PUBLIC_FEATURE_COMPARISON.map((row) => <p key={row.label}><strong>{row.label}:</strong> <CheckMark value={row.values[plan.tier]} /></p>)}</article>)}</div></section>

      <section className="landing-section faq-section"><div className="section-kicker">FAQ</div><h2>Questions before you capture?</h2><div className="faq-grid">{faqs.map(([question, answer]) => <details className="faq-item" key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div></section>

      <section className="landing-section final-cta-section"><div className="landing-card"><div className="section-kicker">Ready when you are</div><h2>Start with the simple documentation workflow.</h2><p>CRED Essentials gives your team Capture → Review → Approve → Export from day one. Professional and Investigation are ready when complex work needs more structure.</p><Link href={isAuthenticated ? '/dashboard?checkout=individual' : '/sign-up?plan=individual'} className="button button-primary">Start with Essentials</Link></div></section>

      <footer className="landing-footer"><div><strong>CRED by ProFixIQ</strong><p>Capture → Review → Approve → Export</p></div><div className="footer-links"><a href="#pricing">Pricing</a><Link href="/sign-up?plan=individual">Start with Essentials</Link></div></footer>
    </main>
  )
}
