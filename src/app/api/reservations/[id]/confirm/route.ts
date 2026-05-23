import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withIdempotency } from "@/lib/idempotency";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return withIdempotency(req, async () => {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (reservation.status === "CONFIRMED") {
      return NextResponse.json(reservation);
    }

    if (
      reservation.status === "RELEASED" ||
      reservation.expiresAt < new Date()
    ) {
      if (reservation.status === "PENDING" && reservation.expiresAt < new Date()) {
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
            where: { id },
            data: { status: "RELEASED", releasedAt: new Date() },
          }),
        ]);
      }
      return NextResponse.json(
        { error: "Reservation has expired or was already released." },
        { status: 410 }
      );
    }

    const confirmed = await prisma.reservation.update({
      where: { id },
      data: { status: "CONFIRMED", confirmedAt: new Date() },
      include: {
        product: { select: { id: true, name: true, sku: true, price: true } },
        warehouse: { select: { id: true, name: true, location: true } },
      },
    });

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