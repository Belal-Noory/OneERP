import { FuelTankDetailClient } from "./FuelTankDetailClient";

export default async function FuelTankDetailPage(props: { params: Promise<{ tenantSlug: string; tankId: string }> }) {
  const { tenantSlug, tankId } = await props.params;
  return <FuelTankDetailClient tenantSlug={tenantSlug} tankId={tankId} />;
}
