import { PrintFuelCreditInvoiceClient } from "./PrintFuelCreditInvoiceClient";

export default function PrintFuelCreditInvoicePage(props: { params: { tenantSlug: string; invoiceNumber: string } }) {
  return <PrintFuelCreditInvoiceClient tenantSlug={props.params.tenantSlug} invoiceNumber={props.params.invoiceNumber} />;
}
