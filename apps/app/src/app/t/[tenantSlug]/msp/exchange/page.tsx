import { MspExchangeClient } from "./MspExchangeClient";

export default async function MspExchangePage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspExchangeClient tenantSlug={tenantSlug} />;
}
