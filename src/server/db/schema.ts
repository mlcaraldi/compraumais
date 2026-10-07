import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const tenantId = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const inList = (col: string, values: string[]) =>
  sql.raw(`${col} in (${values.map((v) => `'${v}'`).join(", ")})`);

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    tenantId: tenantId(),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("operator"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("users_role_check", inList("role", ["admin", "operator"]))],
);

export const segments = pgTable(
  "segments",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    hasRecipes: boolean("has_recipes").notNull().default(false),
  },
  (t) => [uniqueIndex("segments_tenant_code").on(t.tenantId, t.code)],
);

export const segmentAliases = pgTable(
  "segment_aliases",
  {
    id: id(),
    tenantId: tenantId(),
    rawValue: text("raw_value").notNull(),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id),
  },
  (t) => [uniqueIndex("segment_aliases_tenant_raw").on(t.tenantId, t.rawValue)],
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: tenantId(),
    externalCode: text("external_code").notNull(),
    document: text("document"),
    documentValid: boolean("document_valid"),
    legalName: text("legal_name").notNull(),
    tradeName: text("trade_name"),
    contactName: text("contact_name"),
    registeredAt: date("registered_at"),
    lastPurchaseAt: date("last_purchase_at"),
    blocked: boolean("blocked").notNull().default(false),
    address: text("address"),
    addressNumber: text("address_number"),
    district: text("district"),
    city: text("city"),
    state: text("state"),
    phoneRaw: text("phone_raw"),
    phoneE164: text("phone_e164"),
    phoneKind: text("phone_kind"),
    segmentRaw: text("segment_raw"),
    segmentId: uuid("segment_id").references(() => segments.id),
    cnae: text("cnae"),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_tenant_code").on(t.tenantId, t.externalCode),
    index("customers_tenant_document").on(t.tenantId, t.document),
    check(
      "customers_phone_kind_check",
      sql.raw(`phone_kind is null or phone_kind in ('mobile', 'landline', 'invalid')`),
    ),
  ],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    tenantId: tenantId(),
    code: text("code").notNull(),
    description: text("description").notNull(),
    brand: text("brand"),
    packText: text("pack_text"),
    packQty: numeric("pack_qty"),
    packUnitSize: numeric("pack_unit_size"),
    packUnit: text("pack_unit"),
    saleUnit: text("sale_unit"),
    listPriceCents: integer("list_price_cents"),
    priceUpdatedAt: timestamp("price_updated_at", { withTimezone: true }),
    category: text("category"),
    sellable: boolean("sellable").notNull().default(true),
    source: text("source").notNull().default("manual"),
    searchText: text("search_text").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("products_tenant_code").on(t.tenantId, t.code),
    index("products_search_trgm").using("gin", sql`${t.searchText} gin_trgm_ops`),
    check("products_source_check", inList("source", ["catalog", "order", "promotion", "manual"])),
    check(
      "products_sale_unit_check",
      sql.raw(`sale_unit is null or sale_unit in ('un', 'pct', 'kg', 'cx')`),
    ),
  ],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    isCommodity: boolean("is_commodity").notNull().default(false),
  },
  (t) => [uniqueIndex("ingredients_tenant_normalized").on(t.tenantId, t.normalizedName)],
);

export const ingredientProducts = pgTable(
  "ingredient_products",
  {
    id: id(),
    tenantId: tenantId(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    priority: integer("priority").notNull().default(1),
    status: text("status").notNull().default("suggested"),
    suggestedBy: text("suggested_by").notNull().default("user"),
  },
  (t) => [
    uniqueIndex("ingredient_products_pair").on(t.ingredientId, t.productId),
    check(
      "ingredient_products_status_check",
      inList("status", ["suggested", "approved", "rejected"]),
    ),
    check("ingredient_products_by_check", inList("suggested_by", ["ai", "user"])),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    tenantId: tenantId(),
    sha256: text("sha256").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    kind: text("kind").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("documents_tenant_sha").on(t.tenantId, t.sha256),
    check(
      "documents_kind_check",
      inList("kind", ["customers", "products", "recipes", "order", "promotion"]),
    ),
  ],
);

export const recipes = pgTable(
  "recipes",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    yieldPortions: integer("yield_portions").notNull().default(1),
    photoSha: text("photo_sha"),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("recipes_status_check", inList("status", ["draft", "active"]))],
);

export const recipeSegments = pgTable(
  "recipe_segments",
  {
    tenantId: tenantId(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id),
  },
  (t) => [primaryKey({ columns: [t.recipeId, t.segmentId] })],
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: id(),
    tenantId: tenantId(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id),
    qtyPerPortion: numeric("qty_per_portion").notNull(),
    unit: text("unit").notNull(),
    isAnchor: boolean("is_anchor").notNull().default(false),
    isEssential: boolean("is_essential").notNull().default(false),
    packSizeHint: numeric("pack_size_hint"),
    packPriceHintCents: integer("pack_price_hint_cents"),
  },
  () => [check("recipe_items_unit_check", inList("unit", ["g", "ml", "un"]))],
);

export const customerRecipes = pgTable(
  "customer_recipes",
  {
    id: id(),
    tenantId: tenantId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "cascade" }),
    portionsPerDay: numeric("portions_per_day"),
    source: text("source").notNull().default("user"),
    confirmed: boolean("confirmed").notNull().default(true),
  },
  (t) => [
    uniqueIndex("customer_recipes_pair").on(t.customerId, t.recipeId),
    check("customer_recipes_source_check", inList("source", ["user", "segment_suggestion"])),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: tenantId(),
    externalNumber: text("external_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    repCode: text("rep_code"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    paymentTerms: text("payment_terms"),
    totalCents: integer("total_cents"),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id),
    status: text("status").notNull().default("draft"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("orders_tenant_number").on(t.tenantId, t.externalNumber),
    index("orders_customer").on(t.customerId, t.issuedAt),
    check("orders_status_check", inList("status", ["draft", "confirmed"])),
  ],
);

export const orderLines = pgTable("order_lines", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  rawCode: text("raw_code"),
  rawDescription: text("raw_description"),
  unit: text("unit"),
  qty: numeric("qty").notNull(),
  unitPriceCents: integer("unit_price_cents"),
  totalCents: integer("total_cents"),
});

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    tenantId: tenantId(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("queued"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costCentsEstimate: numeric("cost_cents_estimate"),
    rawOutput: jsonb("raw_output"),
    error: text("error"),
    createdBy: uuid("created_by").references(() => users.id),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [
    check(
      "import_jobs_kind_check",
      inList("kind", ["customers", "products", "recipes", "order", "promotion"]),
    ),
    check(
      "import_jobs_status_check",
      inList("status", ["queued", "extracting", "review", "committing", "done", "failed"]),
    ),
  ],
);

export const importRows = pgTable(
  "import_rows",
  {
    id: id(),
    tenantId: tenantId(),
    importJobId: uuid("import_job_id")
      .notNull()
      .references(() => importJobs.id, { onDelete: "cascade" }),
    rowIndex: integer("row_index").notNull(),
    rowType: text("row_type").notNull(),
    data: jsonb("data").notNull(),
    warnings: jsonb("warnings")
      .notNull()
      .default(sql`'[]'::jsonb`),
    confidence: numeric("confidence"),
    matchType: text("match_type"),
    matchId: uuid("match_id"),
    matchScore: numeric("match_score"),
    status: text("status").notNull().default("pending"),
  },
  (t) => [
    index("import_rows_job").on(t.importJobId, t.rowIndex),
    check(
      "import_rows_type_check",
      inList("row_type", [
        "customer",
        "product",
        "recipe",
        "recipe_item",
        "order_header",
        "order_line",
        "promotion_header",
        "promotion_item",
      ]),
    ),
    check(
      "import_rows_match_check",
      sql.raw(
        `match_type is null or match_type in ('code', 'document', 'description', 'new', 'none')`,
      ),
    ),
    check(
      "import_rows_status_check",
      inList("status", ["pending", "accepted", "edited", "rejected"]),
    ),
  ],
);

export const promotions = pgTable(
  "promotions",
  {
    id: id(),
    tenantId: tenantId(),
    name: text("name").notNull(),
    supplierBrand: text("supplier_brand"),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    conditionsText: text("conditions_text"),
    targetSegmentsHint: text("target_segments_hint").array(),
    documentId: uuid("document_id").references(() => documents.id),
    status: text("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  () => [check("promotions_status_check", inList("status", ["active", "expired", "draft"]))],
);

export const promotionItems = pgTable(
  "promotion_items",
  {
    id: id(),
    tenantId: tenantId(),
    promotionId: uuid("promotion_id")
      .notNull()
      .references(() => promotions.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id),
    rawCode: text("raw_code"),
    rawDescription: text("raw_description").notNull(),
    packText: text("pack_text"),
    priceCents: integer("price_cents").notNull(),
    priceUnit: text("price_unit").notNull(),
    boxPriceCents: integer("box_price_cents"),
    regularPriceCents: integer("regular_price_cents"),
    priceType: text("price_type").notNull().default("unit_price"),
    minQty: numeric("min_qty"),
    conditionText: text("condition_text"),
  },
  () => [
    check("promotion_items_unit_check", inList("price_unit", ["un", "pct", "kg", "cx"])),
    check(
      "promotion_items_type_check",
      inList("price_type", ["unit_price", "min_qty", "bundle", "other"]),
    ),
  ],
);

export const suggestionRuns = pgTable("suggestion_runs", {
  id: id(),
  tenantId: tenantId(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  engineVersion: text("engine_version").notNull(),
  settingsSnapshot: jsonb("settings_snapshot").notNull(),
  createdAt: createdAt(),
});

export const suggestionItems = pgTable(
  "suggestion_items",
  {
    id: id(),
    tenantId: tenantId(),
    runId: uuid("run_id")
      .notNull()
      .references(() => suggestionRuns.id, { onDelete: "cascade" }),
    list: text("list").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    recipeIds: uuid("recipe_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    promotionItemId: uuid("promotion_item_id").references(() => promotionItems.id),
    priceCents: integer("price_cents"),
    priceUnit: text("price_unit"),
    score: numeric("score").notNull().default("0"),
    rank: integer("rank").notNull().default(0),
    reasons: jsonb("reasons")
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  () => [check("suggestion_items_list_check", inList("list", ["A", "B", "reminder"]))],
);

export const suggestionMessages = pgTable("suggestion_messages", {
  id: id(),
  tenantId: tenantId(),
  runId: uuid("run_id")
    .notNull()
    .references(() => suggestionRuns.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  editedText: text("edited_text"),
  createdAt: createdAt(),
});

export const suggestionOutcomes = pgTable(
  "suggestion_outcomes",
  {
    id: id(),
    tenantId: tenantId(),
    runId: uuid("run_id")
      .notNull()
      .references(() => suggestionRuns.id, { onDelete: "cascade" }),
    sent: boolean("sent").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    result: text("result").notNull(),
    acceptedProductIds: uuid("accepted_product_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  () => [
    check(
      "suggestion_outcomes_result_check",
      inList("result", ["accepted", "partial", "declined", "no_response", "not_sent"]),
    ),
  ],
);

export const settings = pgTable(
  "settings",
  {
    tenantId: tenantId(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);

export const auditLog = pgTable("audit_log", {
  id: id(),
  tenantId: tenantId(),
  userId: uuid("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  diff: jsonb("diff"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
