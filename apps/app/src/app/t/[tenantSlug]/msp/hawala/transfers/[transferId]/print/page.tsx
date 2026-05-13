import { PrintMspHawalaTransferClient } from "./PrintMspHawalaTransferClient";

export default async function PrintMspHawalaTransferPage(props: { params: Promise<{ tenantSlug: string; transferId: string }> }) {
  const { tenantSlug, transferId } = await props.params;
  return <PrintMspHawalaTransferClient tenantSlug={tenantSlug} transferId={transferId} />;
}

