import { PrintCustomerStatementClient } from "./PrintCustomerStatementClient";

export default async function CustomerStatementPage(props: { params: Promise<{ tenantSlug: string; customerId: string }> }) {
  const { tenantSlug, customerId } = await props.params;
  return <PrintCustomerStatementClient tenantSlug={tenantSlug} customerId={customerId} />;
}

