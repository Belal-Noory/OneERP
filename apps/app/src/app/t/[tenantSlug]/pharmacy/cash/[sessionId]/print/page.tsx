import { PrintPharmacyCashSessionClient } from "./PrintPharmacyCashSessionClient";

export default async function PrintPharmacyCashSessionPage(props: { params: Promise<{ tenantSlug: string; sessionId: string }> }) {
  const { tenantSlug, sessionId } = await props.params;
  return <PrintPharmacyCashSessionClient tenantSlug={tenantSlug} sessionId={sessionId} />;
}

