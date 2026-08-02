export type User = {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type VerifyCredentialsInput = {
  email: string;
  password: string;
};

export class EmailAlreadyRegisteredError extends Error {
  constructor(email: string) {
    super(`email already registered: ${email}`);
    this.name = "EmailAlreadyRegisteredError";
  }
}

export class InvalidRegistrationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRegistrationInputError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountLockedError extends Error {
  constructor() {
    super("account is locked");
    this.name = "AccountLockedError";
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = "unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface AuthenticationService {
  register(input: RegisterInput | Record<string, any>): Promise<any>;
  verifyCredentials(input: VerifyCredentialsInput): Promise<any>;
  getUserProfile(userId: string): Promise<any>;
  logout(token: string): Promise<any>;
  logoutAll(userId: string): Promise<any>;
}
