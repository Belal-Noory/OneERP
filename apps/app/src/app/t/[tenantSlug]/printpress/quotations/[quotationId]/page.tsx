import { PrintPressQuotationDetailClient } from "./PrintPressQuotationDetailClient";

export default async function PrintPressQuotationDetailPage(props: { params: Promise<{ tenantSlug: string; quotationId: string }> }) {
  const { tenantSlug, quotationId } = await props.params;
  return <PrintPressQuotationDetailClient tenantSlug={tenantSlug} quotationId={quotationId} />;
}

