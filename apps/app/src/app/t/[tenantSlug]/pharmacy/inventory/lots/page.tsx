import { PharmacyInventoryLotsClient } from "./PharmacyInventoryLotsClient";

export default async function PharmacyInventoryLotsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyInventoryLotsClient tenantSlug={tenantSlug} />;
}

