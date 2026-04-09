import { PharmacySettingsClient } from "./PharmacySettingsClient";

export default async function PharmacySettingsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacySettingsClient tenantSlug={tenantSlug} />;
}

