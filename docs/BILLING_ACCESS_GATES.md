# Billing access gates

CRED uses app-controlled billing access for paid product actions. The shared billing gate lives in `src/features/billing/access.ts` and should be used before mutating product data, creating public access, sending email, or creating AI/provider cost.

## Active access

An organization has active billing access when either of these is true:

- `subscription_status === "active"`.
- `subscription_status === "trialing"` and `trial_ends_at` is in the future.

During active access, users may perform paid product actions, including:

- Create documentation sessions.
- Save or update session details, including field service details.
- Upload or create capture records.
- Run AI capture classification.
- Run AI evidence extraction and save generated session suggestions.
- Apply extracted evidence or session suggestions to session fields.
- Import, create, duplicate, update, archive, or delete organization templates and template-required evidence definitions.
- Capture signatures.
- Open authenticated printable reports when that records export activity.
- Save report exports.
- Email reports.
- Create new report share links.
- Edit paid report/capture details that update report content.

## Expired or inactive access

An organization does not have paid-action access when its subscription is canceled, unpaid, past due, incomplete, inactive, missing, or otherwise not `active`; or when it is `trialing` with an expired or invalid `trial_ends_at`.

Blocked actions return or redirect with this friendly user-facing message:

> Your trial has ended. Subscribe to continue.

After expiry, users cannot perform paid product actions, including:

- Creating new sessions.
- Saving or updating session details or field service details.
- Creating captures, editing capture report details, or removing captures from report evidence.
- Running AI classification or AI extraction.
- Importing, creating, duplicating, updating, archiving, or deleting templates.
- Creating or editing required evidence rules through template saves/imports.
- Capturing signatures.
- Opening authenticated printable reports when doing so would create a `printable_report_opened` export event.
- Saving report exports.
- Emailing reports.
- Creating new report share links.

## Actions still allowed after expiry

Expired-trial or inactive-subscription users can still access account and recovery paths that do not create paid product usage:

- Sign in and sign out.
- Complete onboarding if required to reach billing.
- View the dashboard.
- View existing sessions and captures.
- View billing status.
- Open Stripe Checkout to subscribe or reactivate access.
- Allow Stripe webhook handling to update billing state.
- Disable existing share links for security and privacy.

## Public share links after owner expiry

Existing public report share links continue to work until the token expires or is disabled. Public share-link viewing is intentionally not gated by the owner's current billing status, because the link was already granted and remains controlled by token expiration and `disabled_at`.

Authenticated owners with expired or inactive access cannot create new share links or open the authenticated printable-report route in a way that records a new export event. They can still disable an existing share link after expiry as a security/privacy action.

## Implementation notes

- New paid server actions should call `requireActiveBillingAccess(profile)` after authentication/authorization and before paid mutation, email, share-link creation, public-access creation, or provider-cost work.
- Do not gate Stripe Checkout or Stripe webhook routes.
- Do not gate read-only dashboard/account/billing pages.
- If an action is blocked, surface the friendly subscribe message through the existing error-display pattern instead of throwing raw provider or database errors to the user.
