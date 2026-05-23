import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  return withIdempotency(req, async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    // Already confirmed — idempotent success
    if (reservation.status === "CONFIRMED") {
      return NextResponse.json(reservation);
    }

    // Released or expired
    if (
      reservation.status === "RELEASED" ||
      reservation.expiresAt < new Date()
    ) {
      // If it expired but inventory wasn't released yet, release it now (lazy cleanup)
      if (reservation.status === "PENDING" && reservation.expiresAt < new Date()) {
        await releaseInventory(reservation);
      }
      return NextResponse.json(
        { error: "Reservation has expired or was already released." },
        { status: 410 }
      );
    }

    // Confirm
    const confirmed = await prisma.reservation.update({
      where: { id: params.id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });

    // Permanently decrement total stock (reserved stays as-is, total goes down)
    await prisma.inventory.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: {
        total: { decrement: reservation.quantity },
        reserved: { decrement: reservation.quantity },
      },
    });

    return NextResponse.json(confirmed);
  });
}

async function releaseInventory(reservation: {
  productId: string;
  warehouseId: string;
  quantity: number;
  id: string;
}) {
  await prisma.$transaction([
    prisma.inventory.update({
      where: {
        productId_warehouseId: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
      },
      data: { reserved: { decrement: reservation.quantity } },
    }),
    prisma.reservation.update({
      where: { id: reservation.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    }),
  ]);
}
