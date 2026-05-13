import { PrintPharmacySupplierLedgerClient } from "./PrintPharmacySupplierLedgerClient";

export default async function PrintPharmacySupplierLedgerPage(props: { params: Promise<{ tenantSlug: string; supplierId: string }> }) {
  const { tenantSlug, supplierId } = await props.params;
  return <PrintPharmacySupplierLedgerClient tenantSlug={tenantSlug} supplierId={supplierId} />;
}

