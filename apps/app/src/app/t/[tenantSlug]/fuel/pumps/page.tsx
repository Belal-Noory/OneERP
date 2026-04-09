import { FuelPumpsClient } from "./FuelPumpsClient";

export default async function FuelPumpsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <FuelPumpsClient tenantSlug={tenantSlug} />;
}
