import { FuelSalesClient } from "./FuelSalesClient";

export default async function FuelSalesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <FuelSalesClient tenantSlug={tenantSlug} />;
}
