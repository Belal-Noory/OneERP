import { MspSettlementsClient } from "./MspSettlementsClient";

export default async function MspSettlementsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspSettlementsClient tenantSlug={tenantSlug} />;
}
