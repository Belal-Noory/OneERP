import { PrintPharmacyLotsClient } from "./PrintPharmacyLotsClient";

export default async function PrintPharmacyLotsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyLotsClient tenantSlug={tenantSlug} />;
}

