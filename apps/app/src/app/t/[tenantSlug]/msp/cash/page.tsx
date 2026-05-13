import { MspCashClient } from "./MspCashClient";

export default async function MspCashPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspCashClient tenantSlug={tenantSlug} />;
}
