import { PharmacyProductsClient } from "../products/PharmacyProductsClient";

export default async function PharmacyMedicinesPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  return <PharmacyProductsClient tenantSlug={tenantSlug} variant="medicines" />;
}

