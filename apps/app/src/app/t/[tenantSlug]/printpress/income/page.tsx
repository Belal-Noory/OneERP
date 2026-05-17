import { PrintPressIncomeClient } from "./PrintPressIncomeClient";

export default async function PrintPressIncomePage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressIncomeClient tenantSlug={tenantSlug} />;
}

