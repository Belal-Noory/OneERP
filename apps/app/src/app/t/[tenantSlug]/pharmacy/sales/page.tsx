import { PharmacySalesClient } from "./PharmacySalesClient";

export default async function PharmacySalesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacySalesClient tenantSlug={tenantSlug} />;
}

