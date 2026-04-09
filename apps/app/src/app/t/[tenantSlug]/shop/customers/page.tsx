import { CustomersClient } from "./CustomersClient";

export default async function ShopCustomersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <CustomersClient tenantSlug={tenantSlug} />;
}
