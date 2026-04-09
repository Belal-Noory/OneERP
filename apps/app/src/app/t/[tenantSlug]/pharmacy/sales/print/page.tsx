import { PrintPharmacySalesClient } from "./PrintPharmacySalesClient";

export default async function PrintPharmacySalesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacySalesClient tenantSlug={tenantSlug} />;
}

