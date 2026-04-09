import { DashboardClient } from "./DashboardClient";

export default async function TenantDashboardPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <DashboardClient tenantSlug={tenantSlug} />;
}
