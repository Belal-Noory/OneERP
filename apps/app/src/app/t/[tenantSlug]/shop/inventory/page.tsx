import { InventoryClient } from "./InventoryClient";

export default async function ShopInventoryPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <InventoryClient tenantSlug={tenantSlug} />;
}
