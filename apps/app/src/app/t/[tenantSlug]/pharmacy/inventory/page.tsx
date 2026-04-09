import { PharmacyInventoryClient } from "./PharmacyInventoryClient";

export default async function PharmacyInventoryPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyInventoryClient tenantSlug={tenantSlug} />;
}

