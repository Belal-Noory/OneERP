import { PrintFuelReportsClient } from "./PrintFuelReportsClient";

export default async function PrintFuelReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintFuelReportsClient tenantSlug={tenantSlug} />;
}

