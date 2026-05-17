import { PrintPressCustomersClient } from "./PrintPressCustomersClient";

export default async function PrintPressCustomersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressCustomersClient tenantSlug={tenantSlug} />;
}
