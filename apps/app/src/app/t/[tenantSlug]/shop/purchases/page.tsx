import { PurchasesClient } from "./PurchasesClient";

export default async function PurchasesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PurchasesClient tenantSlug={tenantSlug} />;
}

