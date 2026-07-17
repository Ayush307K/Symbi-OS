const { createClient } = require("@libsql/client");
require("dotenv").config();

function dbClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const parsed = new URL(url);
  const authToken = parsed.searchParams.get("authToken") || process.env.TURSO_AUTH_TOKEN || "";
  parsed.searchParams.delete("authToken");
  return createClient({
    url: parsed.toString(),
    authToken,
    fetch: (input, init = {}) => {
      const requestLike = input && typeof input === "object" && "url" in input;
      const headers = new Headers(requestLike ? input.headers : init.headers);
      headers.set("accept-encoding", "identity");
      if (requestLike) {
        return fetch(input.url, {
          method: input.method,
          body: input.body,
          headers,
          signal: input.signal,
        });
      }
      return fetch(input, { ...init, headers });
    },
    concurrency: 1,
  });
}

async function hasColumn(client, table, column) {
  const result = await executeWithRetry(client, `pragma table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function executeWithRetry(client, sql, args) {
  let attempt = 0;
  while (true) {
    try {
      return await client.execute(args ? { sql, args } : sql);
    } catch (error) {
      attempt += 1;
      if (attempt >= 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
}

async function addColumn(client, table, column, definition) {
  if (!(await hasColumn(client, table, column))) {
    await executeWithRetry(client, `alter table ${table} add column ${column} ${definition}`);
    console.log(`Added ${table}.${column}`);
  }
}

async function main() {
  const client = dbClient();

  await addColumn(client, "User", "mobile", "TEXT");
  await addColumn(client, "User", "emailVerifiedAt", "DATETIME");
  await addColumn(client, "User", "mobileVerifiedAt", "DATETIME");
  await addColumn(client, "User", "lastLoginAt", "DATETIME");

  const statements = [
    `create table if not exists Address (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT 'Office',
      contactName TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL DEFAULT 'India',
      state TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT,
      area TEXT,
      locality TEXT,
      landmark TEXT,
      buildingName TEXT,
      floor TEXT,
      unitNumber TEXT,
      street TEXT NOT NULL,
      pincode TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      isDefaultShipping BOOLEAN NOT NULL DEFAULT false,
      isDefaultBilling BOOLEAN NOT NULL DEFAULT false,
      addressType TEXT NOT NULL DEFAULT 'SHIPPING',
      verificationStatus TEXT NOT NULL DEFAULT 'UNVERIFIED',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT Address_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists CartItem (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      priceSnapshot REAL NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT CartItem_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT CartItem_listingId_fkey FOREIGN KEY (listingId) REFERENCES MarketplaceListing(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists WishlistItem (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT WishlistItem_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT WishlistItem_listingId_fkey FOREIGN KEY (listingId) REFERENCES MarketplaceListing(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists PurchaseOrder (
      id TEXT PRIMARY KEY NOT NULL,
      orderNumber TEXT NOT NULL,
      buyerUserId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      paymentStatus TEXT NOT NULL DEFAULT 'PENDING',
      shippingAddressId TEXT,
      billingAddressId TEXT,
      subtotal REAL NOT NULL,
      taxAmount REAL NOT NULL,
      shippingAmount REAL NOT NULL,
      discountAmount REAL NOT NULL DEFAULT 0,
      totalAmount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      gstInvoice BOOLEAN NOT NULL DEFAULT true,
      purchaseOrderNumber TEXT,
      notes TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT PurchaseOrder_buyerUserId_fkey FOREIGN KEY (buyerUserId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT PurchaseOrder_shippingAddressId_fkey FOREIGN KEY (shippingAddressId) REFERENCES Address(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT PurchaseOrder_billingAddressId_fkey FOREIGN KEY (billingAddressId) REFERENCES Address(id) ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `create table if not exists PurchaseOrderItem (
      id TEXT PRIMARY KEY NOT NULL,
      orderId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      sellerCompanyId TEXT NOT NULL,
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit TEXT NOT NULL,
      pricePerUnit REAL NOT NULL,
      lineTotal REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT PurchaseOrderItem_orderId_fkey FOREIGN KEY (orderId) REFERENCES PurchaseOrder(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT PurchaseOrderItem_listingId_fkey FOREIGN KEY (listingId) REFERENCES MarketplaceListing(id) ON UPDATE CASCADE
    )`,
    `create table if not exists Review (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      listingId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT,
      body TEXT NOT NULL,
      mediaJson TEXT,
      verifiedPurchase BOOLEAN NOT NULL DEFAULT false,
      helpfulCount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT Review_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT Review_listingId_fkey FOREIGN KEY (listingId) REFERENCES MarketplaceListing(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists MessageThread (
      id TEXT PRIMARY KEY NOT NULL,
      listingId TEXT,
      buyerUserId TEXT NOT NULL,
      sellerUserId TEXT,
      sellerCompanyId TEXT,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT MessageThread_listingId_fkey FOREIGN KEY (listingId) REFERENCES MarketplaceListing(id) ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT MessageThread_buyerUserId_fkey FOREIGN KEY (buyerUserId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT MessageThread_sellerUserId_fkey FOREIGN KEY (sellerUserId) REFERENCES User(id) ON DELETE SET NULL ON UPDATE CASCADE
    )`,
    `create table if not exists Message (
      id TEXT PRIMARY KEY NOT NULL,
      threadId TEXT NOT NULL,
      senderUserId TEXT NOT NULL,
      body TEXT NOT NULL,
      attachmentsJson TEXT,
      status TEXT NOT NULL DEFAULT 'SENT',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      readAt DATETIME,
      CONSTRAINT Message_threadId_fkey FOREIGN KEY (threadId) REFERENCES MessageThread(id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT Message_senderUserId_fkey FOREIGN KEY (senderUserId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists Notification (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      actionUrl TEXT,
      readAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT Notification_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create table if not exists SellerOnboarding (
      id TEXT PRIMARY KEY NOT NULL,
      userId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      currentStep TEXT NOT NULL DEFAULT 'BUSINESS',
      businessJson TEXT,
      taxJson TEXT,
      bankJson TEXT,
      kycJson TEXT,
      warehouseJson TEXT,
      policyJson TEXT,
      submittedAt DATETIME,
      reviewedAt DATETIME,
      reviewerNote TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT SellerOnboarding_userId_fkey FOREIGN KEY (userId) REFERENCES User(id) ON DELETE CASCADE ON UPDATE CASCADE
    )`,
    `create unique index if not exists CartItem_userId_listingId_key on CartItem(userId, listingId)`,
    `create unique index if not exists WishlistItem_userId_listingId_key on WishlistItem(userId, listingId)`,
    `create unique index if not exists PurchaseOrder_orderNumber_key on PurchaseOrder(orderNumber)`,
    `create unique index if not exists SellerOnboarding_userId_key on SellerOnboarding(userId)`,
    `create index if not exists Address_userId_idx on Address(userId)`,
    `create index if not exists Address_pincode_idx on Address(pincode)`,
    `create index if not exists CartItem_listingId_idx on CartItem(listingId)`,
    `create index if not exists WishlistItem_listingId_idx on WishlistItem(listingId)`,
    `create index if not exists PurchaseOrder_buyerUserId_idx on PurchaseOrder(buyerUserId)`,
    `create index if not exists PurchaseOrder_status_idx on PurchaseOrder(status)`,
    `create index if not exists PurchaseOrderItem_orderId_idx on PurchaseOrderItem(orderId)`,
    `create index if not exists PurchaseOrderItem_listingId_idx on PurchaseOrderItem(listingId)`,
    `create index if not exists PurchaseOrderItem_sellerCompanyId_idx on PurchaseOrderItem(sellerCompanyId)`,
    `create index if not exists Review_listingId_idx on Review(listingId)`,
    `create index if not exists Review_userId_idx on Review(userId)`,
    `create index if not exists MessageThread_buyerUserId_idx on MessageThread(buyerUserId)`,
    `create index if not exists MessageThread_sellerUserId_idx on MessageThread(sellerUserId)`,
    `create index if not exists MessageThread_listingId_idx on MessageThread(listingId)`,
    `create index if not exists Message_threadId_idx on Message(threadId)`,
    `create index if not exists Message_senderUserId_idx on Message(senderUserId)`,
    `create index if not exists Notification_userId_idx on Notification(userId)`,
    `create index if not exists Notification_readAt_idx on Notification(readAt)`,
  ];

  for (const sql of statements) {
    await executeWithRetry(client, sql);
  }

  const tables = await executeWithRetry(client,
    "select name from sqlite_master where type='table' and name in ('Address','CartItem','WishlistItem','PurchaseOrder','PurchaseOrderItem','Review','MessageThread','Message','Notification','SellerOnboarding') order by name"
  );
  console.log(JSON.stringify(tables.rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
