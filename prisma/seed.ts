import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Warehouses
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.upsert({
      where: { id: "wh-mumbai" },
      update: {},
      create: { id: "wh-mumbai", name: "Mumbai Central", location: "Mumbai, MH" },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh-delhi" },
      update: {},
      create: { id: "wh-delhi", name: "Delhi North", location: "Delhi, DL" },
    }),
    prisma.warehouse.upsert({
      where: { id: "wh-bangalore" },
      update: {},
      create: { id: "wh-bangalore", name: "Bangalore Tech Park", location: "Bangalore, KA" },
    }),
  ]);

  // Products with inventory
  const products = [
    {
      id: "prod-watch",
      name: "Arctis Pro Mechanical Watch",
      sku: "WATCH-ARC-001",
      price: 12999,
      description: "Swiss-movement dress watch with sapphire crystal and leather strap.",
      inventory: [
        { warehouseId: mumbai.id, total: 3 },
        { warehouseId: delhi.id, total: 5 },
        { warehouseId: bangalore.id, total: 2 },
      ],
    },
    {
      id: "prod-headphones",
      name: "SonicWave ANC Headphones",
      sku: "HEAD-SW-200",
      price: 8499,
      description: "40-hour battery active noise cancellation with studio-grade drivers.",
      inventory: [
        { warehouseId: mumbai.id, total: 8 },
        { warehouseId: delhi.id, total: 1 },
        { warehouseId: bangalore.id, total: 6 },
      ],
    },
    {
      id: "prod-keyboard",
      name: "Keychron Q5 Mechanical Keyboard",
      sku: "KB-Q5-HOTSWAP",
      price: 15500,
      description: "Full aluminium body, hot-swap PCB, RGB backlight, QMK compatible.",
      inventory: [
        { warehouseId: mumbai.id, total: 4 },
        { warehouseId: delhi.id, total: 4 },
        { warehouseId: bangalore.id, total: 0 },
      ],
    },
    {
      id: "prod-camera",
      name: "Lumix G100 Mirrorless Camera",
      sku: "CAM-G100-KIT",
      price: 59900,
      description: "Compact 4K mirrorless with vlogging mic array and 12–32mm kit lens.",
      inventory: [
        { warehouseId: mumbai.id, total: 1 },
        { warehouseId: delhi.id, total: 2 },
        { warehouseId: bangalore.id, total: 1 },
      ],
    },
    {
      id: "prod-sneakers",
      name: "Hoka Clifton 9 Running Shoes",
      sku: "SHOE-HOKA-C9-42",
      price: 13500,
      description: "Maximum cushion everyday trainer, EU 42, Black/White colourway.",
      inventory: [
        { warehouseId: mumbai.id, total: 6 },
        { warehouseId: delhi.id, total: 3 },
        { warehouseId: bangalore.id, total: 5 },
      ],
    },
    {
      id: "prod-monitor",
      name: 'LG UltraWide 34" Monitor',
      sku: "MON-LG-34WQ",
      price: 42000,
      description: '34-inch IPS panel, 21:9 WQHD, 100Hz, USB-C 65W charging.',
      inventory: [
        { warehouseId: mumbai.id, total: 2 },
        { warehouseId: delhi.id, total: 0 },
        { warehouseId: bangalore.id, total: 3 },
      ],
    },
  ];

  for (const p of products) {
    const { inventory, ...productData } = p;
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: productData,
    });
    for (const inv of inventory) {
      await prisma.inventory.upsert({
        where: {
          productId_warehouseId: {
            productId: p.id,
            warehouseId: inv.warehouseId,
          },
        },
        update: {},
        create: {
          productId: p.id,
          warehouseId: inv.warehouseId,
          total: inv.total,
          reserved: 0,
        },
      });
    }
  }

  console.log(`Seeded ${products.length} products across 3 warehouses.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
