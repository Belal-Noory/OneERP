import { MspDashboardClient } from "./MspDashboardClient";

export default async function MspPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspDashboardClient tenantSlug={tenantSlug} />;
}

