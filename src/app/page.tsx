import { ProductCard } from "@/components/ProductCard";

async function getProducts() {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/products`, {
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error("Failed to load products");
  return res.json();
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-900">Products</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Reserve items to hold them for 10 minutes while you check out.
        </p>
      </div>

      {products.length === 0 ? (
        <p className="text-zinc-500">No products available. Seed the database first.</p>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product: any) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
