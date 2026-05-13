import { PrintPharmacyMovementsClient } from "./PrintPharmacyMovementsClient";

export default async function PrintPharmacyMovementsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyMovementsClient tenantSlug={tenantSlug} />;
}

