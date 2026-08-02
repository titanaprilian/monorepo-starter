export type ResponseSetLike = {
  status?: number | string;
};

export function successResponse<T>(data: T): { data: T } {
  return { data };
}

const errorCodeFromClassName = (className: string): string => {
  const withoutSuffix = className.endsWith("Error")
    ? className.slice(0, -"Error".length)
    : className;
  return withoutSuffix
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();
};

const deriveErrorCode = (error: Error): string => {
  const className = error.constructor?.name || error.name || "Error";
  return errorCodeFromClassName(className);
};

export function errorResponse(
  set: ResponseSetLike,
  status: number,
  error: Error
): { error: { code: string; message: string } } {
  set.status = status;
  return {
    error: {
      code: deriveErrorCode(error),
      message: error.message,
    },
  };
}
