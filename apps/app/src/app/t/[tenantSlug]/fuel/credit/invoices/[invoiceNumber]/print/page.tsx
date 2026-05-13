import { PrintFuelCreditInvoiceClient } from "./PrintFuelCreditInvoiceClient";

export default async function PrintFuelCreditInvoicePage(props: { params: Promise<{ tenantSlug: string; invoiceNumber: string }> }) {
  const params = await props.params;
  return <PrintFuelCreditInvoiceClient tenantSlug={params.tenantSlug} invoiceNumber={params.invoiceNumber} />;
}
