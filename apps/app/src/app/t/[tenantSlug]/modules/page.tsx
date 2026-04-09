import { ModulesClient } from "./ModulesClient";

export default async function TenantModulesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <ModulesClient tenantSlug={tenantSlug} />;
}

