import { SupplierLedgerClient } from "./SupplierLedgerClient";

export default async function SupplierLedgerPage(props: { params: Promise<{ tenantSlug: string; supplierId: string }> }) {
  const { tenantSlug, supplierId } = await props.params;
  return <SupplierLedgerClient tenantSlug={tenantSlug} supplierId={supplierId} />;
}

