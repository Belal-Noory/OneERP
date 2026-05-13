import { MspSettingsClient } from "./MspSettingsClient";

export default async function MspSettingsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspSettingsClient tenantSlug={tenantSlug} />;
}
