import { OrdersClient } from "./OrdersClient";

export default async function ShopOrdersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <OrdersClient tenantSlug={tenantSlug} />;
}
