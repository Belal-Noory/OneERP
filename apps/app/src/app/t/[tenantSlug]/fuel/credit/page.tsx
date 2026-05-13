import { FuelCreditClient } from "./FuelCreditClient";

export default async function FuelCreditPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const params = await props.params;
  return <FuelCreditClient tenantSlug={params.tenantSlug} />;
}
