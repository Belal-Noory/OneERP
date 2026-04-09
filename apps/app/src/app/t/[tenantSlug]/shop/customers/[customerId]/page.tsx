import { CustomerLedgerClient } from "./CustomerLedgerClient";

export default async function CustomerLedgerPage(props: { params: Promise<{ tenantSlug: string; customerId: string }> }) {
  const { tenantSlug, customerId } = await props.params;
  return <CustomerLedgerClient tenantSlug={tenantSlug} customerId={customerId} />;
}

