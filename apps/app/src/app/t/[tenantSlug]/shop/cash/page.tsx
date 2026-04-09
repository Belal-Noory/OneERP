import { CashSessionsClient } from "./CashSessionsClient";

export default async function ShopCashPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <CashSessionsClient tenantSlug={tenantSlug} />;
}

