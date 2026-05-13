import { ProductsClient } from "./ProductsClient";

export default async function ShopProductsPage(props: { params: Promise<{ tenantSlug: string }>; searchParams: Promise<{ newBarcode?: string }> }) {
  const { tenantSlug } = await props.params;
  const { newBarcode } = await props.searchParams;
  return <ProductsClient tenantSlug={tenantSlug} prefillBarcode={newBarcode ?? null} />;
}
