import { describe, expect, test } from "bun:test";
import { runSeeder } from "./run-seeder";

describe("runSeeder", () => {
  test("is exported as a function", () => {
    expect(typeof runSeeder).toBe("function");
  });
});
