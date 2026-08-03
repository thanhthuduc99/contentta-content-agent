import ItemEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function ItemPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sp = await searchParams;
  const id = typeof sp.id === "string" ? sp.id : "";
  if (!id) return <p className="text-brand">Thiếu id.</p>;
  return <ItemEditor id={id} />;
}
