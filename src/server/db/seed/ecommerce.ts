import type { ClientBase } from "pg";
import type { Faker } from "@faker-js/faker";
import { bulkInsert, uniqueEmail } from "./faker.js";

const N_STORES = 50;
const N_PRODUCTS = 2000;
const N_CUSTOMERS = 4000;
const N_ORDERS = 5000;
const N_ORDER_ITEMS = 12000;
const N_PAYMENTS = 5000;

const ORDER_STATUSES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "refunded",
  "cancelled",
] as const;
const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded"] as const;
const PROVIDERS = ["stripe", "adyen", "internal"];
const CURATED_STORE_NAMES = [
  "Bay Area Bagels",
  "Polychrome Press",
  "Tundra Knitwear",
  "Plate Tectonics Coffee",
  "Bonsai Workshop",
  "Synaptic Records",
  "Greenhouse Plants",
  "Lacquer Stationery",
  "Salt & Vinegar Books",
  "Mile High Sneakers",
];

export async function seedEcommerce(
  client: ClientBase,
  rng: Faker,
  ftUserIds: number[],
): Promise<void> {
  // ec_catalog.stores
  const usedSlugs = new Set<string>();
  const storeRows: unknown[][] = [];
  while (storeRows.length < N_STORES) {
    const name = rng.helpers.arrayElement(CURATED_STORE_NAMES) + " " + rng.location.city();
    const slug = name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    if (usedSlugs.has(slug)) continue;
    usedSlugs.add(slug);
    storeRows.push([slug, name, rng.internet.email().toLowerCase(), rng.date.past({ years: 5 })]);
  }
  await bulkInsert(
    client,
    "ec_catalog.stores",
    ["slug", "name", "owner_email", "created_at"],
    storeRows,
  );

  // ec_catalog.products — UNIQUE per (store_id, sku); ~5% soft-deleted
  const usedSkus = new Set<string>();
  const productRows: unknown[][] = [];
  while (productRows.length < N_PRODUCTS) {
    const storeId = rng.number.int({ min: 1, max: N_STORES });
    const sku = `SKU-${storeId}-${rng.string.alphanumeric({ length: 6, casing: "upper" })}`;
    if (usedSkus.has(sku)) continue;
    usedSkus.add(sku);
    const isDeleted = rng.number.float({ min: 0, max: 1 }) < 0.05;
    productRows.push([
      storeId,
      sku,
      rng.commerce.productName(),
      rng.number.int({ min: 99, max: 50_000 }), // cents
      rng.number.int({ min: 0, max: 500 }),
      !isDeleted,
      rng.date.past({ years: 3 }),
      isDeleted ? rng.date.recent({ days: 90 }) : null,
    ]);
  }
  await bulkInsert(
    client,
    "ec_catalog.products",
    [
      "store_id",
      "sku",
      "name",
      "price_cents",
      "inventory_qty",
      "is_active",
      "created_at",
      "deleted_at",
    ],
    productRows,
  );

  // ec_customers.customers — UNIQUE per (store_id, email). uniqueEmail
  // guarantees uniqueness even within a store.
  const customerRows: unknown[][] = Array.from({ length: N_CUSTOMERS }, (_, i) => {
    const storeId = rng.number.int({ min: 1, max: N_STORES });
    return [
      storeId,
      uniqueEmail(rng, `cust${i}`),
      rng.person.fullName(),
      rng.date.past({ years: 3 }),
    ];
  });
  await bulkInsert(
    client,
    "ec_customers.customers",
    ["store_id", "email", "full_name", "created_at"],
    customerRows,
  );

  // ec_orders.orders — store-customer pairs must match (FK + business)
  // We seed assuming customers are evenly distributed across stores so picking
  // a random customer + random store would violate the FK story. Instead:
  // pick a customer first, then take their store_id from the seeded distribution.
  const customerStores: number[] = customerRows.map((r) => r[0] as number);
  const orderRows: unknown[][] = [];
  for (let i = 0; i < N_ORDERS; i++) {
    const custIdx = rng.number.int({ min: 0, max: customerStores.length - 1 });
    const customerId = custIdx + 1;
    const storeId = customerStores[custIdx];
    if (storeId === undefined) continue;
    const status = rng.helpers.weightedArrayElement([
      { weight: 15, value: ORDER_STATUSES[0] }, // pending
      { weight: 20, value: ORDER_STATUSES[1] }, // paid
      { weight: 25, value: ORDER_STATUSES[2] }, // shipped
      { weight: 30, value: ORDER_STATUSES[3] }, // delivered
      { weight: 5, value: ORDER_STATUSES[4] }, // refunded
      { weight: 5, value: ORDER_STATUSES[5] }, // cancelled
    ]);
    const createdAt = rng.date.recent({ days: 180 });
    orderRows.push([
      storeId,
      customerId,
      status,
      rng.number.int({ min: 500, max: 100_000 }),
      createdAt,
      createdAt,
    ]);
  }
  await bulkInsert(
    client,
    "ec_orders.orders",
    ["store_id", "customer_id", "status", "total_cents", "created_at", "updated_at"],
    orderRows,
  );

  // ec_orders.order_items — composite PK (order_id, product_id) requires distinct products per order
  const productStores: number[] = productRows.map((r) => r[0] as number);
  const orderStores: number[] = orderRows.map((r) => r[0] as number);
  const itemSeen = new Set<string>();
  const itemRows: unknown[][] = [];
  let attempt = 0;
  while (itemRows.length < N_ORDER_ITEMS && attempt < N_ORDER_ITEMS * 4) {
    attempt++;
    const orderId = rng.number.int({ min: 1, max: N_ORDERS });
    // Pick a product from the same store as the order to keep things plausible.
    const orderStore = orderStores[orderId - 1];
    if (orderStore === undefined) continue;
    const sameStoreProducts: number[] = [];
    for (let p = 0; p < productStores.length; p++) {
      if (productStores[p] === orderStore) sameStoreProducts.push(p + 1);
    }
    if (sameStoreProducts.length === 0) continue;
    const productId =
      sameStoreProducts[rng.number.int({ min: 0, max: sameStoreProducts.length - 1 })];
    if (productId === undefined) continue;
    const key = `${orderId}-${productId}`;
    if (itemSeen.has(key)) continue;
    itemSeen.add(key);
    itemRows.push([
      orderId,
      productId,
      rng.number.int({ min: 1, max: 5 }),
      rng.number.int({ min: 99, max: 50_000 }),
    ]);
  }
  await bulkInsert(
    client,
    "ec_orders.order_items",
    ["order_id", "product_id", "qty", "unit_price_cents"],
    itemRows,
  );

  // ec_payments.payments — one per order (most), ~80% have processor_user_id
  const paymentRows: unknown[][] = [];
  for (let i = 0; i < N_PAYMENTS; i++) {
    const orderId = rng.number.int({ min: 1, max: N_ORDERS });
    const status = rng.helpers.weightedArrayElement([
      { weight: 10, value: PAYMENT_STATUSES[0] },
      { weight: 80, value: PAYMENT_STATUSES[1] },
      { weight: 5, value: PAYMENT_STATUSES[2] },
      { weight: 5, value: PAYMENT_STATUSES[3] },
    ]);
    const processorRef =
      rng.number.float({ min: 0, max: 1 }) < 0.8 && ftUserIds.length > 0
        ? (ftUserIds[rng.number.int({ min: 0, max: ftUserIds.length - 1 })] ?? null)
        : null;
    paymentRows.push([
      orderId,
      rng.number.int({ min: 500, max: 100_000 }),
      status,
      rng.helpers.arrayElement(PROVIDERS),
      processorRef,
      rng.date.recent({ days: 180 }),
    ]);
  }
  await bulkInsert(
    client,
    "ec_payments.payments",
    ["order_id", "amount_cents", "status", "provider", "processor_user_id", "created_at"],
    paymentRows,
  );
}
