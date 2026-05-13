import { MspHawalaClient } from "./MspHawalaClient";

export default async function MspHawalaPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspHawalaClient tenantSlug={tenantSlug} />;
}
