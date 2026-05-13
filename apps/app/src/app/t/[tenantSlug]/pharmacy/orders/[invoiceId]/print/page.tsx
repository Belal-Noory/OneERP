import { PrintPharmacyInvoiceClient } from "./PrintPharmacyInvoiceClient";

export default async function PrintPharmacyInvoicePage(props: { params: Promise<{ tenantSlug: string; invoiceId: string }> }) {
  const { tenantSlug, invoiceId } = await props.params;
  return <PrintPharmacyInvoiceClient tenantSlug={tenantSlug} invoiceId={invoiceId} />;
}

