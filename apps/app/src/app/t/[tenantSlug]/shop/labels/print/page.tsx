import { PrintLabelsClient } from "./PrintLabelsClient";

export default async function PrintLabelsPage(props: { params: Promise<{ tenantSlug: string }>; searchParams: Promise<{ key?: string }> }) {
  const { tenantSlug } = await props.params;
  const { key } = await props.searchParams;
  return <PrintLabelsClient tenantSlug={tenantSlug} storageKey={key ?? ""} />;
}

