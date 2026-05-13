import { MspLedgerClient } from "./MspLedgerClient";

export default async function MspLedgerPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspLedgerClient tenantSlug={tenantSlug} />;
}
