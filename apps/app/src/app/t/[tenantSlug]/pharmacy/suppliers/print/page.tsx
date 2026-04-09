import { PrintPharmacySuppliersClient } from "./PrintPharmacySuppliersClient";

export default async function PrintPharmacySuppliersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacySuppliersClient tenantSlug={tenantSlug} />;
}

