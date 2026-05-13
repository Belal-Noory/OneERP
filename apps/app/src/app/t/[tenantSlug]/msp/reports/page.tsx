import { MspReportsClient } from "./MspReportsClient";

export default async function MspReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspReportsClient tenantSlug={tenantSlug} />;
}
