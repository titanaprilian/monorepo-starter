import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const system = pgTable("system", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export type SystemRow = typeof system.$inferSelect;
export type NewSystemRow = typeof system.$inferInsert;
