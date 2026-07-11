import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const kvExample = sqliteTable("kv_example", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: text("created_at").notNull(),
});
