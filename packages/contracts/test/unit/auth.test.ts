import { describe, expect, it } from "vitest";
import { EmailAlreadyRegisteredError, InvalidCredentialsError } from "../../src/auth";

describe("auth contract errors", () => {
  it("creates EmailAlreadyRegisteredError with message", () => {
    const error = new EmailAlreadyRegisteredError("test@example.com");
    expect(error.message).toBe("email already registered: test@example.com");
    expect(error.name).toBe("EmailAlreadyRegisteredError");
  });

  it("creates InvalidCredentialsError with message", () => {
    const error = new InvalidCredentialsError();
    expect(error.message).toBe("invalid email or password");
    expect(error.name).toBe("InvalidCredentialsError");
  });
});
