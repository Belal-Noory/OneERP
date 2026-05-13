import { PharmacyPurchasesClient } from "./PharmacyPurchasesClient";

export default async function PharmacyPurchasesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyPurchasesClient tenantSlug={tenantSlug} />;
}

