import { PrintInvoiceClient } from "./PrintInvoiceClient";

export default async function PrintInvoicePage(props: { params: Promise<{ tenantSlug: string; invoiceId: string }> }) {
  const { tenantSlug, invoiceId } = await props.params;
  return <PrintInvoiceClient tenantSlug={tenantSlug} invoiceId={invoiceId} />;
}

