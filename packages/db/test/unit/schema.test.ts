import { describe, expect, it } from "vitest";
import * as schema from "../../src/schema";

describe("db schema exports", () => {
  it("exports schema definitions", () => {
    expect(schema).toBeDefined();
  });
});
