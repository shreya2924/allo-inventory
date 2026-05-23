import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const products = await prisma.product.findMany({
    include: {
      inventory: {
        include: { warehouse: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const shaped = products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    imageUrl: p.imageUrl,
    sku: p.sku,
    price: p.price,
    inventory: p.inventory.map((inv) => ({
      warehouseId: inv.warehouseId,
      warehouseName: inv.warehouse.name,
      warehouseLocation: inv.warehouse.location,
      total: inv.total,
      reserved: inv.reserved,
      available: inv.total - inv.reserved,
    })),
  }));

  return NextResponse.json(shaped);
}
