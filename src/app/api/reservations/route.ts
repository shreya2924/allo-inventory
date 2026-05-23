import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock, inventoryLockKey } from "@/lib/redis";
import { withIdempotency } from "@/lib/idempotency";
import { CreateReservationSchema } from "@/lib/schemas";

const TTL_MINUTES = Number(process.env.RESERVATION_TTL_MINUTES ?? "10");

export async function POST(req: NextRequest) {
  return withIdempotency(req, async () => {
    // 1. Parse + validate body
    const body = await req.json().catch(() => null);
    const parsed = CreateReservationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const { productId, warehouseId, quantity } = parsed.data;

    // 2. Acquire distributed lock — one winner per product+warehouse
    const lockKey = inventoryLockKey(productId, warehouseId);
    const locked = await acquireLock(lockKey, 15);
    if (!locked) {
      return NextResponse.json(
        { error: "Too many concurrent requests for this item. Please try again." },
        { status: 429 }
      );
    }

    try {
      // 3. Atomically check available stock and increment reserved.
      //    We use a raw UPDATE ... RETURNING so the read + write is one
      //    statement — no TOCTOU gap even if Redis lock is not used.
      //    The Redis lock is an extra layer of defense and also prevents
      //    thundering-herd on the DB.
      const updated = await prisma.$queryRaw<{ id: string }[]>`
        UPDATE "Inventory"
        SET    "reserved" = "reserved" + ${quantity},
               "updatedAt" = NOW()
        WHERE  "productId"   = ${productId}
          AND  "warehouseId" = ${warehouseId}
          AND  ("total" - "reserved") >= ${quantity}
        RETURNING id
      `;

      if (updated.length === 0) {
        return NextResponse.json(
          { error: "Not enough stock available." },
          { status: 409 }
        );
      }

      // 4. Create the reservation record
      const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000);
      const reservation = await prisma.reservation.create({
        data: { productId, warehouseId, quantity, expiresAt },
        include: {
          product: { select: { id: true, name: true, sku: true, price: true } },
          warehouse: { select: { id: true, name: true, location: true } },
        },
      });

      return NextResponse.json(reservation, { status: 201 });
    } finally {
      await releaseLock(lockKey);
    }
  });
}
