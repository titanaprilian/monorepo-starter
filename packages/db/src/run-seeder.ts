import { createDbClient } from "./client";
import { seed } from "./seed";

export async function runSeeder(): Promise<void> {
  const db = createDbClient();
  try {
    await seed(db);
    console.log("Database seeded successfully.");
    await db.$client.end();
    process.exit(0);
  } catch (error) {
    console.error("Database seeding failed:", error);
    await db.$client.end().catch(() => {});
    process.exit(1);
  }
}

if (import.meta.main) {
  runSeeder();
}
