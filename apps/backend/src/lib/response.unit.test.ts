import { describe, expect, test } from "bun:test";
import { errorResponse, successResponse, type ResponseSetLike } from "./response";

describe("successResponse", () => {
  test("wraps a primitive value in a { data } envelope", () => {
    expect(successResponse(42)).toEqual({ data: 42 });
  });

  test("wraps a string in a { data } envelope", () => {
    expect(successResponse("hello")).toEqual({ data: "hello" });
  });

  test("wraps an object in a { data } envelope", () => {
    const user = { id: "user-123", email: "test@example.com" };
    expect(successResponse(user)).toEqual({ data: user });
  });

  test("wraps an array in a { data } envelope", () => {
    const items = ["a", "b"];
    expect(successResponse(items)).toEqual({ data: items });
  });

  test("wraps a boolean in a { data } envelope", () => {
    expect(successResponse(true)).toEqual({ data: true });
  });
});

describe("errorResponse", () => {
  test("sets set.status to the given status code", () => {
    const set: ResponseSetLike = { status: 200 };
    const result = errorResponse(set, 409, new EmailAlreadyRegisteredError());

    expect(set.status).toBe(409);
    expect(result).toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "email already registered",
      },
    });
  });

  test("returns { error: { code, message } }", () => {
    const set: ResponseSetLike = {};
    const result = errorResponse(set, 400, new InvalidRegistrationInputError());

    expect(set.status).toBe(400);
    expect(result).toEqual({
      error: {
        code: "INVALID_REGISTRATION_INPUT",
        message: "invalid registration input",
      },
    });
  });

  test("derives SCREAMING_SNAKE_CASE code and strips the trailing Error suffix", () => {
    const set: ResponseSetLike = {};
    const result = errorResponse(set, 409, new EmailAlreadyRegisteredError());

    expect(result).toEqual({
      error: {
        code: "EMAIL_ALREADY_REGISTERED",
        message: "email already registered",
      },
    });
    expect(set.status).toBe(409);
  });

  test("derives codes for several error class name patterns", () => {
    const cases: Array<[Error, string]> = [
      [new EmailAlreadyRegisteredError(), "EMAIL_ALREADY_REGISTERED"],
      [new InvalidRegistrationInputError(), "INVALID_REGISTRATION_INPUT"],
      [new InvalidCredentialsError(), "INVALID_CREDENTIALS"],
      [new UserNotFoundError(), "USER_NOT_FOUND"],
      [new PaymentProcessingError(), "PAYMENT_PROCESSING"],
    ];

    for (const [error, expectedCode] of cases) {
      const set: ResponseSetLike = {};
      const result = errorResponse(set, 500, error);
      expect(result.error.code).toBe(expectedCode);
    }
  });
});

class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("email already registered");
    this.name = "EmailAlreadyRegisteredError";
  }
}

class InvalidRegistrationInputError extends Error {
  constructor() {
    super("invalid registration input");
    this.name = "InvalidRegistrationInputError";
  }
}

class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid credentials");
    this.name = "InvalidCredentialsError";
  }
}

class UserNotFoundError extends Error {
  constructor() {
    super("user not found");
    this.name = "UserNotFoundError";
  }
}

class PaymentProcessingError extends Error {
  constructor() {
    super("payment processing failed");
    this.name = "PaymentProcessingError";
  }
}
