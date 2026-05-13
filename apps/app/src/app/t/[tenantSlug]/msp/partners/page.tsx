import { MspPartnersClient } from "./MspPartnersClient";

export default async function MspPartnersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspPartnersClient tenantSlug={tenantSlug} />;
}
