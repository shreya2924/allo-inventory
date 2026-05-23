"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type InventoryLine = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  total: number;
  reserved: number;
  available: number;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  inventory: InventoryLine[];
};

export function ProductCard({ product }: { product: Product }) {
  const router = useRouter();
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>(
    product.inventory[0]?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const line = product.inventory.find((i) => i.warehouseId === selectedWarehouse);
  const available = line?.available ?? 0;
  const canReserve = available >= quantity && quantity >= 1;

  async function handleReserve() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Generate a unique idempotency key per attempt
          "Idempotency-Key": `${product.id}-${selectedWarehouse}-${Date.now()}`,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouse,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(`/reservation/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const totalAvailable = product.inventory.reduce((s, i) => s + i.available, 0);

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-zinc-900">{product.name}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">SKU {product.sku}</p>
        </div>
        <span className="text-sm font-semibold text-indigo-700 whitespace-nowrap">
          ₹{product.price.toLocaleString()}
        </span>
      </div>

      {product.description && (
        <p className="text-sm text-zinc-500 leading-relaxed">{product.description}</p>
      )}

      {/* Warehouse selector */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-zinc-600 uppercase tracking-wide">
          Stock by warehouse
        </p>
        {product.inventory.map((inv) => (
          <label
            key={inv.warehouseId}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 cursor-pointer transition-colors ${
              selectedWarehouse === inv.warehouseId
                ? "border-indigo-500 bg-indigo-50"
                : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <div className="flex items-center gap-2">
              <input
                type="radio"
                name={`warehouse-${product.id}`}
                value={inv.warehouseId}
                checked={selectedWarehouse === inv.warehouseId}
                onChange={() => setSelectedWarehouse(inv.warehouseId)}
                className="accent-indigo-600"
              />
              <span className="text-sm text-zinc-700">{inv.warehouseName}</span>
              <span className="text-xs text-zinc-400">{inv.warehouseLocation}</span>
            </div>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                inv.available > 5
                  ? "bg-green-100 text-green-700"
                  : inv.available > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-600"
              }`}
            >
              {inv.available} avail
            </span>
          </label>
        ))}
      </div>

      {/* Quantity */}
      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-zinc-600">Qty</label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="h-7 w-7 rounded-md border border-zinc-300 text-zinc-600 text-sm hover:bg-zinc-50 disabled:opacity-40"
            disabled={quantity <= 1}
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-medium">{quantity}</span>
          <button
            onClick={() => setQuantity((q) => Math.min(available, q + 1))}
            className="h-7 w-7 rounded-md border border-zinc-300 text-zinc-600 text-sm hover:bg-zinc-50 disabled:opacity-40"
            disabled={quantity >= available}
          >
            +
          </button>
        </div>
        <span className="text-xs text-zinc-400 ml-auto">
          {totalAvailable} total across all warehouses
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        onClick={handleReserve}
        disabled={!canReserve || loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Reserving…" : available === 0 ? "Out of stock" : "Reserve"}
      </button>
    </div>
  );
}
