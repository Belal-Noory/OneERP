import { AuditLogsClient } from "./AuditLogsClient";

export default async function ShopAuditPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <AuditLogsClient tenantSlug={tenantSlug} />;
}

