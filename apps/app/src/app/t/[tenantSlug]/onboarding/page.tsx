import { OnboardingClient } from "./OnboardingClient";

export default async function TenantOnboardingPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <OnboardingClient tenantSlug={tenantSlug} />;
}

