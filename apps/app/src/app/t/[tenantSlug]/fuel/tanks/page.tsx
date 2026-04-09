import { FuelTanksClient } from "./FuelTanksClient";

export default async function FuelTanksPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <FuelTanksClient tenantSlug={tenantSlug} />;
}
