export type User = {
  id: string;
  email: string;
  createdAt: Date;
};

export type RegisterInput = {
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

export interface AuthenticationService {
  register(input: RegisterInput): Promise<User>;
  verifyCredentials(input: VerifyCredentialsInput): Promise<User>;
}
