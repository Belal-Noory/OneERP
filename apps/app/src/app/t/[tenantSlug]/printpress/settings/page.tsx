import { PrintPressSettingsClient } from "./PrintPressSettingsClient";

export default async function PrintPressSettingsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressSettingsClient tenantSlug={tenantSlug} />;
}
