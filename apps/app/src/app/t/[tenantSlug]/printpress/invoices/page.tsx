import { PrintPressInvoicesClient } from "./PrintPressInvoicesClient";

export default async function PrintPressInvoicesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressInvoicesClient tenantSlug={tenantSlug} />;
}

