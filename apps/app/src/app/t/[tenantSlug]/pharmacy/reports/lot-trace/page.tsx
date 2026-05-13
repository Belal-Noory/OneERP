import { PharmacyLotTraceReportClient } from "./PharmacyLotTraceReportClient";

export default async function PharmacyLotTraceReportPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyLotTraceReportClient tenantSlug={tenantSlug} />;
}

