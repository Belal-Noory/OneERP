import { PharmacyCashSessionsClient } from "./PharmacyCashSessionsClient";

export default async function PharmacyCashPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyCashSessionsClient tenantSlug={tenantSlug} />;
}

