import { TeamClient } from "./TeamClient";

export default async function TenantTeamPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <TeamClient tenantSlug={tenantSlug} />;
}

