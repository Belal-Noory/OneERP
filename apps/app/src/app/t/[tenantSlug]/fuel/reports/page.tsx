import { FuelReportsClient } from "./FuelReportsClient";

export default async function FuelReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;

  return <FuelReportsClient tenantSlug={tenantSlug} />;
}
