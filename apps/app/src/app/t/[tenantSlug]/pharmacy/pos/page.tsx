import { PharmacyPOSClient } from "./PharmacyPOSClient";

export default async function PharmacyPOSPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyPOSClient tenantSlug={tenantSlug} />;
}

