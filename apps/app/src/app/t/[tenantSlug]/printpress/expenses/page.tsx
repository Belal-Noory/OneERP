import { PrintPressExpensesClient } from "./PrintPressExpensesClient";

export default async function PrintPressExpensesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPressExpensesClient tenantSlug={tenantSlug} />;
}

