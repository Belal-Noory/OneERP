import { PrintPressQuotationsClient } from "./PrintPressQuotationsClient";

export default async function PrintPressQuotationsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressQuotationsClient tenantSlug={tenantSlug} />;
}
