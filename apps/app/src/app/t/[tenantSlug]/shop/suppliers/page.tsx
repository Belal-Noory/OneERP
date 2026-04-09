import { SuppliersClient } from "./SuppliersClient";

export default async function SuppliersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <SuppliersClient tenantSlug={tenantSlug} />;
}

