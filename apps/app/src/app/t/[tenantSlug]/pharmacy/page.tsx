export default async function PharmacyPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const { PharmacyOverviewClient } = await import("./PharmacyOverviewClient");
  return <PharmacyOverviewClient tenantSlug={tenantSlug} />;
}
