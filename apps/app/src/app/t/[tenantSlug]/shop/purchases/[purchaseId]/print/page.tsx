import { PrintPurchaseInvoiceClient } from "./PrintPurchaseInvoiceClient";

export default async function PrintPurchaseInvoicePage(props: { params: Promise<{ tenantSlug: string; purchaseId: string }> }) {
  const { tenantSlug, purchaseId } = await props.params;
  return <PrintPurchaseInvoiceClient tenantSlug={tenantSlug} purchaseId={purchaseId} />;
}

