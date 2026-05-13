import { FuelShiftsClient } from "./FuelShiftsClient";

export default async function FuelShiftsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <FuelShiftsClient tenantSlug={tenantSlug} />;
}
