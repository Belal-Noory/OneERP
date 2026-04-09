import { PrintPharmacyReportsClient } from "./PrintPharmacyReportsClient";

export default async function PrintPharmacyReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyReportsClient tenantSlug={tenantSlug} />;
}

