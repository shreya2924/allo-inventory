import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
  });

  if (!reservation) {
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  }

  if (reservation.status === "RELEASED") {
    return NextResponse.json({ message: "Already released." });
  }

  if (reservation.status === "CONFIRMED") {
    return NextResponse.json(
      { error: "Cannot release a confirmed reservation." },
      { status: 409 }
    );
  }

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
      where: { id: params.id },
      data: { status: "RELEASED", releasedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ message: "Reservation released." });
}
