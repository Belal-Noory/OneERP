import { PrintPressCustomerLedgerClient } from "./PrintPressCustomerLedgerClient";

export default async function PrintPressCustomerLedgerPage(props: { params: Promise<{ tenantSlug: string; customerId: string }> }) {
  const { tenantSlug, customerId } = await props.params;
  return <PrintPressCustomerLedgerClient tenantSlug={tenantSlug} customerId={customerId} />;
}
