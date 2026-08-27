-- Stripe is the sole authority for subscription state changes. Keep this
-- SECURITY DEFINER mutation outside the public Data API surface and call it
-- only from trusted server code using the service-role client.
revoke execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) from public;
revoke execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) from anon;
revoke execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) from authenticated;

grant execute on function public.sync_organization_subscription(uuid, text, text, text, text, timestamptz) to service_role;
