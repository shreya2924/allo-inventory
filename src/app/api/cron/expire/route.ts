import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Called by Vercel Cron every minute (see vercel.json).
 * Finds all PENDING reservations past their expiresAt and releases them,
 * returning held stock to available inventory in a single transaction batch.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("authorization");
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expiredReservations = await prisma.reservation.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lt: new Date() },
    },
  });

  if (expiredReservations.length === 0) {
    return NextResponse.json({ released: 0 });
  }

  await prisma.$transaction(
    expiredReservations.flatMap((r) => [
      prisma.inventory.update({
        where: {
          productId_warehouseId: {
            productId: r.productId,
            warehouseId: r.warehouseId,
          },
        },
        data: { reserved: { decrement: r.quantity } },
      }),
      prisma.reservation.update({
        where: { id: r.id },
        data: { status: "RELEASED", releasedAt: new Date() },
      }),
    ])
  );

  return NextResponse.json({ released: expiredReservations.length });
}
