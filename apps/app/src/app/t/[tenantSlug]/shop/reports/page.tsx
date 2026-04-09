import { ReportsClient } from "./ReportsClient";

export default async function ShopReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <ReportsClient tenantSlug={tenantSlug} />;
}
