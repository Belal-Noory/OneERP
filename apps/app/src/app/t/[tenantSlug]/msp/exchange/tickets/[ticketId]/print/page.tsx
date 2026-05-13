import { PrintMspExchangeTicketClient } from "./PrintMspExchangeTicketClient";

export default async function PrintMspExchangeTicketPage(props: { params: Promise<{ tenantSlug: string; ticketId: string }> }) {
  const { tenantSlug, ticketId } = await props.params;
  return <PrintMspExchangeTicketClient tenantSlug={tenantSlug} ticketId={ticketId} />;
}

