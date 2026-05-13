import { MspAuditClient } from "./MspAuditClient";

export default async function MspAuditPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspAuditClient tenantSlug={tenantSlug} />;
}
