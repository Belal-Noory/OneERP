import { PurchaseInvoiceClient } from "./PurchaseInvoiceClient";

export default async function PurchaseInvoicePage(props: { params: Promise<{ tenantSlug: string; purchaseId: string }> }) {
  const { tenantSlug, purchaseId } = await props.params;
  return <PurchaseInvoiceClient tenantSlug={tenantSlug} purchaseId={purchaseId} />;
}

