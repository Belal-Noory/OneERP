import { FuelCreditClient } from "./FuelCreditClient";

export default function FuelCreditPage(props: { params: { tenantSlug: string } }) {
  return <FuelCreditClient tenantSlug={props.params.tenantSlug} />;
}
