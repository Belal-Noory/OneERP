import { MspCustomersClient } from "./MspCustomersClient";

export default async function MspCustomersPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspCustomersClient tenantSlug={tenantSlug} />;
}
