import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.number().int().positive(),
});
export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// Shared API response shapes
export const ReservationStatusEnum = z.enum(["PENDING", "CONFIRMED", "RELEASED"]);

export const ReservationSchema = z.object({
  id: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  quantity: z.number(),
  status: ReservationStatusEnum,
  expiresAt: z.string().datetime(),
  confirmedAt: z.string().datetime().nullable(),
  releasedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  product: z.object({ id: z.string(), name: z.string(), sku: z.string(), price: z.number() }),
  warehouse: z.object({ id: z.string(), name: z.string(), location: z.string() }),
});

export const ProductWithStockSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  sku: z.string(),
  price: z.number(),
  inventory: z.array(
    z.object({
      warehouseId: z.string(),
      warehouseName: z.string(),
      warehouseLocation: z.string(),
      total: z.number(),
      reserved: z.number(),
      available: z.number(),
    })
  ),
});
