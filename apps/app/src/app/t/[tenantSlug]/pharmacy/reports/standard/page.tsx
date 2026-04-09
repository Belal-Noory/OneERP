import { PharmacyStandardReportsClient } from "./PharmacyStandardReportsClient";

export default async function PharmacyStandardReportsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyStandardReportsClient tenantSlug={tenantSlug} />;
}

