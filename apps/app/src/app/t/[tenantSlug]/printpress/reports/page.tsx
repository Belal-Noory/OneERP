import { PrintPressReportsClient } from "./PrintPressReportsClient";

export default async function PrintPressReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressReportsClient tenantSlug={tenantSlug} />;
}
