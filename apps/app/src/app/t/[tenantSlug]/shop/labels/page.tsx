import { LabelsClient } from "./LabelsClient";

export default async function LabelsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <LabelsClient tenantSlug={tenantSlug} />;
}

