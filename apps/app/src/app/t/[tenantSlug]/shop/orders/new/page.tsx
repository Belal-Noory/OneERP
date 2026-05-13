import { NewInvoiceClient } from "./NewInvoiceClient";

export default async function NewInvoicePage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <NewInvoiceClient tenantSlug={tenantSlug} />;
}
