import { ReservationClient } from "@/components/ReservationClient";

async function getReservation(id: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const res = await fetch(`${base}/api/reservations/${id}`, {
    next: { revalidate: 0 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error("Failed to load reservation");
  return res.json();
}

export default async function ReservationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <p className="text-zinc-500">Reservation not found.</p>
        <a href="/" className="mt-4 inline-block text-sm text-indigo-600 hover:underline">
          Back to products
        </a>
      </div>
    );
  }

  return <ReservationClient initialReservation={reservation} />;
}