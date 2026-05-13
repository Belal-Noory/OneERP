import { PrintFuelCreditLedgerClient } from "./PrintFuelCreditLedgerClient";

export default async function PrintFuelCreditLedgerPage(props: { params: Promise<{ tenantSlug: string; customerId: string }> }) {
  const params = await props.params;
  return <PrintFuelCreditLedgerClient tenantSlug={params.tenantSlug} customerId={params.customerId} />;
}
