import { PurchaseOrderClient } from "./PurchaseOrderClient";

export default async function PurchaseOrderPage(props: { params: Promise<{ tenantSlug: string; orderId: string }> }) {
  const { tenantSlug, orderId } = await props.params;
  return <PurchaseOrderClient tenantSlug={tenantSlug} orderId={orderId} />;
}

