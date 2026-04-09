import { PrintPharmacyMedicinesClient } from "./PrintPharmacyMedicinesClient";

export default async function PrintPharmacyMedicinesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PrintPharmacyMedicinesClient tenantSlug={tenantSlug} />;
}

