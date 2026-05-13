import { PrintCashSessionClient } from "./PrintCashSessionClient";

export default async function PrintCashSessionPage(props: { params: Promise<{ tenantSlug: string; sessionId: string }> }) {
  const { tenantSlug, sessionId } = await props.params;
  return <PrintCashSessionClient tenantSlug={tenantSlug} sessionId={sessionId} />;
}

