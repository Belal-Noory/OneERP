import { PrintReportsClient } from "./PrintReportsClient";

export default async function PrintReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintReportsClient tenantSlug={tenantSlug} />;
}

