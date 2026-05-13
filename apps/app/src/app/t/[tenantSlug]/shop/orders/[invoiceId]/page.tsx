import { InvoiceClient } from "./InvoiceClient";

export default async function InvoicePage(props: { params: Promise<{ tenantSlug: string; invoiceId: string }> }) {
  const { tenantSlug, invoiceId } = await props.params;
  return <InvoiceClient tenantSlug={tenantSlug} invoiceId={invoiceId} />;
}

