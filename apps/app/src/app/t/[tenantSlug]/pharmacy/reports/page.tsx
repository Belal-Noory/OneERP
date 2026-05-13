import { PharmacyReportsClient } from "./PharmacyReportsClient";

export default async function PharmacyReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyReportsClient tenantSlug={tenantSlug} />;
}

