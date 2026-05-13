import { PrintFuelCreditLedgerClient } from "./PrintFuelCreditLedgerClient";

export default function PrintFuelCreditLedgerPage(props: { params: { tenantSlug: string; customerId: string } }) {
  return <PrintFuelCreditLedgerClient tenantSlug={props.params.tenantSlug} customerId={props.params.customerId} />;
}
