import { PrintPharmacyInventoryClient } from "./PrintPharmacyInventoryClient";

export default async function PrintPharmacyInventoryPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyInventoryClient tenantSlug={tenantSlug} />;
}

