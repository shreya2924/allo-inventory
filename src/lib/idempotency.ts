import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";

const IDEMPOTENCY_TTL_HOURS = 24;

/**
 * Wraps a mutating handler with idempotency support.
 *
 * If the request carries an Idempotency-Key header we've seen before,
 * we return the stored response immediately without re-running the handler.
 * If it's new, we run the handler, store the result, then return it.
 *
 * Storage: IdempotencyRecord table in Postgres (simple, consistent with the
 * rest of the data layer — no extra Redis key format to manage).
 */
export async function withIdempotency(
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const idempotencyKey = req.headers.get("Idempotency-Key");

  if (!idempotencyKey) {
    return handler();
  }

  // Check for an existing record
  const existing = await prisma.idempotencyRecord.findUnique({
    where: { key: idempotencyKey },
  });

  if (existing) {
    if (existing.expiresAt < new Date()) {
      // Expired record — treat as new (clean up lazily)
      await prisma.idempotencyRecord.delete({ where: { key: idempotencyKey } });
    } else {
      // Return the cached response
      return NextResponse.json(existing.responseBody, {
        status: existing.statusCode,
        headers: { "X-Idempotent-Replayed": "true" },
      });
    }
  }

  // Run the actual handler
  const response = await handler();

  // Clone and store the response (we can only read the body once)
  const body = await response.json();
  const expiresAt = new Date(
    Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000
  );

  // Best-effort write — don't fail the request if storage fails
  try {
    await prisma.idempotencyRecord.create({
      data: {
        key: idempotencyKey,
        statusCode: response.status,
        responseBody: body,
        expiresAt,
      },
    });
  } catch {
    // Race condition: another request with the same key just wrote it.
    // That's fine — both responses are identical.
  }

  return NextResponse.json(body, {
    status: response.status,
    headers: response.headers,
  });
}
