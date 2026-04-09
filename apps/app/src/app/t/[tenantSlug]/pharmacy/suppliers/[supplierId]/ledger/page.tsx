import { PharmacySupplierLedgerClient } from "./PharmacySupplierLedgerClient";

export default async function PharmacySupplierLedgerPage(props: { params: Promise<{ tenantSlug: string; supplierId: string }> }) {
  const { tenantSlug, supplierId } = await props.params;
  return <PharmacySupplierLedgerClient tenantSlug={tenantSlug} supplierId={supplierId} />;
}

