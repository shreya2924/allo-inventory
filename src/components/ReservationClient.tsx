"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";

type Reservation = {
  id: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  product: { name: string; sku: string; price: number };
  warehouse: { name: string; location: string };
};

function useCountdown(expiresAt: string, status: string) {
  const getMs = () => new Date(expiresAt).getTime() - Date.now();
  const [ms, setMs] = useState(getMs);

  useEffect(() => {
    if (status !== "PENDING") return;
    const id = setInterval(() => setMs(getMs()), 500);
    return () => clearInterval(id);
  }, [expiresAt, status]);

  return ms;
}

export function ReservationClient({
  initialReservation,
}: {
  initialReservation: Reservation;
}) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initialReservation);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const msLeft = useCountdown(reservation.expiresAt, reservation.status);
  const expired = msLeft <= 0 && reservation.status === "PENDING";

  // Poll reservation status while pending
  useEffect(() => {
    if (reservation.status !== "PENDING") return;
    const id = setInterval(async () => {
      const res = await fetch(`/api/reservations/${reservation.id}`);
      if (res.ok) {
        const data = await res.json();
        setReservation(data);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [reservation.id, reservation.status]);

  const handleConfirm = useCallback(async () => {
    setLoading("confirm");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Idempotency-Key": `confirm-${reservation.id}`,
        },
      });
      const data = await res.json();
      if (res.status === 410) {
        setError("Your reservation expired before you could confirm. Please start over.");
        setReservation((r) => ({ ...r, status: "RELEASED" }));
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Confirmation failed.");
        return;
      }
      setReservation(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const handleCancel = useCallback(async () => {
    setLoading("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not cancel.");
        return;
      }
      setReservation((r) => ({ ...r, status: "RELEASED" }));
      setTimeout(() => router.push("/"), 1500);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id, router]);

  const total = reservation.product.price * reservation.quantity;

  // Format countdown
  let countdownLabel = "";
  if (reservation.status === "PENDING") {
    if (expired) {
      countdownLabel = "Expired";
    } else {
      const totalSec = Math.max(0, Math.floor(msLeft / 1000));
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      countdownLabel = `${m}:${s.toString().padStart(2, "0")} remaining`;
    }
  }

  const urgency = msLeft < 120_000 && reservation.status === "PENDING" && !expired;

  return (
    <div className="max-w-lg mx-auto">
      <a
        href="/"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-800 mb-6"
      >
        ← Back to products
      </a>

      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        {/* Status banner */}
        <div
          className={`px-6 py-3 text-sm font-medium ${
            reservation.status === "CONFIRMED"
              ? "bg-green-50 text-green-700 border-b border-green-100"
              : reservation.status === "RELEASED" || expired
              ? "bg-red-50 text-red-700 border-b border-red-100"
              : urgency
              ? "bg-amber-50 text-amber-700 border-b border-amber-100"
              : "bg-indigo-50 text-indigo-700 border-b border-indigo-100"
          }`}
        >
          {reservation.status === "CONFIRMED" && "✓ Payment confirmed — order placed"}
          {(reservation.status === "RELEASED" || expired) && "✕ Reservation released — items returned to stock"}
          {reservation.status === "PENDING" && !expired && (
            <span className={urgency ? "animate-pulse" : ""}>
              ⏱ {countdownLabel}
            </span>
          )}
        </div>

        <div className="p-6 space-y-5">
          {/* Product summary */}
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              {reservation.product.name}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">SKU {reservation.product.sku}</p>
          </div>

          <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 text-sm">
            <Row label="Warehouse" value={`${reservation.warehouse.name} · ${reservation.warehouse.location}`} />
            <Row label="Quantity" value={reservation.quantity.toString()} />
            <Row label="Unit price" value={`₹${reservation.product.price.toLocaleString()}`} />
            <Row label="Total" value={`₹${total.toLocaleString()}`} bold />
            <Row label="Status" value={reservation.status} />
            <Row
              label="Reservation expires"
              value={
                reservation.status === "PENDING"
                  ? new Date(reservation.expiresAt).toLocaleTimeString()
                  : "—"
              }
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          {reservation.status === "PENDING" && !expired && (
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleConfirm}
                disabled={!!loading}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {loading === "confirm" ? "Confirming…" : "Confirm purchase"}
              </button>
              <button
                onClick={handleCancel}
                disabled={!!loading}
                className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                {loading === "cancel" ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          )}

          {reservation.status === "CONFIRMED" && (
            <a
              href="/"
              className="block text-center text-sm text-indigo-600 hover:underline pt-1"
            >
              Continue shopping
            </a>
          )}

          {(reservation.status === "RELEASED" || expired) && (
            <a
              href="/"
              className="block w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-zinc-700 transition-colors"
            >
              Back to products
            </a>
          )}
        </div>
      </div>

      <p className="mt-4 text-xs text-zinc-400 text-center">
        Reservation ID: {reservation.id}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between px-4 py-2.5">
      <span className="text-zinc-500">{label}</span>
      <span className={bold ? "font-semibold text-zinc-900" : "text-zinc-800"}>
        {value}
      </span>
    </div>
  );
}
