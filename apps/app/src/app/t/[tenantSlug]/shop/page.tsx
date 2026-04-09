export default async function ShopHomePage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const { ShopOverviewClient } = await import("./ShopOverviewClient");
  return <ShopOverviewClient tenantSlug={tenantSlug} />;
}
