import { NextResponse } from 'next/server'

import { getCurrentProfile, getCurrentUser } from '@/features/auth/server'
import { canUseWorkspaceAdmin } from '@/features/navigation-dashboard'
import { createBillingPortalSession } from '@/lib/stripe'

function getAppUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL
  if (!configured) return null
  try {
    return new URL(configured).origin
  } catch {
    return null
  }
}

export async function POST() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const profile = await getCurrentProfile()
  if (!profile) return NextResponse.json({ error: 'Complete onboarding before managing billing.' }, { status: 409 })
  if (!canUseWorkspaceAdmin(profile)) return NextResponse.json({ error: 'Workspace owner or admin access required.' }, { status: 403 })

  const customerId = profile.organization.stripe_customer_id
  if (!customerId) return NextResponse.json({ error: 'No Stripe billing account is connected.' }, { status: 409 })

  const appUrl = getAppUrl()
  if (!appUrl) return NextResponse.json({ error: 'Billing configuration is incomplete.' }, { status: 503 })

  try {
    const session = await createBillingPortalSession({
      customerId,
      returnUrl: `${appUrl}/dashboard/billing`,
    })
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe billing portal failed', {
      organizationId: profile.organization_id,
      error: error instanceof Error ? error.message : 'Unknown portal error',
    })
    return NextResponse.json({ error: 'Unable to open the billing portal.' }, { status: 502 })
  }
}
