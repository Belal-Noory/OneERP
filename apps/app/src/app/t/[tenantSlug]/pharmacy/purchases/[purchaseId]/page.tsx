import { PharmacyPurchaseInvoiceClient } from "./PharmacyPurchaseInvoiceClient";

export default async function PharmacyPurchaseInvoicePage(props: { params: Promise<{ tenantSlug: string; purchaseId: string }> }) {
  const { tenantSlug, purchaseId } = await props.params;
  return <PharmacyPurchaseInvoiceClient tenantSlug={tenantSlug} purchaseId={purchaseId} />;
}

