import { PrintPressJobsClient } from "./PrintPressJobsClient";

export default async function PrintPressJobsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressJobsClient tenantSlug={tenantSlug} />;
}
