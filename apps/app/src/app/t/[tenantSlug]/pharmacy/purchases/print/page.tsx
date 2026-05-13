import { PrintPharmacyPurchasesClient } from "./PrintPharmacyPurchasesClient";

export default async function PrintPharmacyPurchasesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyPurchasesClient tenantSlug={tenantSlug} />;
}

