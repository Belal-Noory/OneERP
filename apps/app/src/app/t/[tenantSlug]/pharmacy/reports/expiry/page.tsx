import { PharmacyExpiryReportClient } from "./PharmacyExpiryReportClient";

export default async function PharmacyExpiryReportPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyExpiryReportClient tenantSlug={tenantSlug} />;
}

