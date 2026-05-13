import { POSClient } from "./POSClient";

export default async function POSPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <POSClient tenantSlug={tenantSlug} />;
}

