import { PrintPressInvoiceDetailClient } from "./PrintPressInvoiceDetailClient";

export default async function PrintPressInvoiceDetailPage(props: { params: Promise<{ tenantSlug: string; invoiceId: string }> }) {
  const { tenantSlug, invoiceId } = await props.params;
  return <PrintPressInvoiceDetailClient tenantSlug={tenantSlug} invoiceId={invoiceId} />;
}

