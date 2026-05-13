import { MspBranchesClient } from "./MspBranchesClient";

export default async function MspBranchesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <MspBranchesClient tenantSlug={tenantSlug} />;
}
