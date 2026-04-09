import { PharmacySuppliersClient } from "./PharmacySuppliersClient";

export default async function PharmacySuppliersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacySuppliersClient tenantSlug={tenantSlug} />;
}

