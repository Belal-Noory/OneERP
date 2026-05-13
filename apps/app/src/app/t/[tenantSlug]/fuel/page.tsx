import { FuelOverviewClient } from "./FuelOverviewClient";

export default async function FuelIndexPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <FuelOverviewClient tenantSlug={tenantSlug} />;
}
