import { PharmacySaleInvoiceClient } from "./PharmacySaleInvoiceClient";

export default async function PharmacySaleInvoicePage(props: { params: Promise<{ tenantSlug: string; invoiceId: string }> }) {
  const { tenantSlug, invoiceId } = await props.params;
  return <PharmacySaleInvoiceClient tenantSlug={tenantSlug} invoiceId={invoiceId} />;
}

