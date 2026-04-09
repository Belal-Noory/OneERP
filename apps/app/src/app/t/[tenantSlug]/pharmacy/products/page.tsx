import { redirect } from "next/navigation";

export default async function PharmacyProductsPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  redirect(`/t/${tenantSlug}/pharmacy/medicines`);
}
