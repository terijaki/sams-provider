type SamsResultWithResponse = {
  error?: unknown;
  response?: Response;
};

/**
 * SAMS often returns 404 for roster endpoints even when squad data exists elsewhere.
 * Treat not-found like missing club logos: keep the stored projection.
 */
export function isSamsNotFoundResult(result: SamsResultWithResponse): boolean {
  if (result.response?.status === 404) {
    return true;
  }
  const error = result.error;
  if (!error) {
    return false;
  }
  if (typeof error === "object" && error !== null) {
    if ("status" in error && error.status === 404) {
      return true;
    }
    if ("message" in error && typeof error.message === "string") {
      const message = error.message.toLowerCase();
      if (message.includes("404") || message.includes("not found")) {
        return true;
      }
    }
  }
  if (typeof error === "string") {
    const message = error.toLowerCase();
    return message.includes("404") || message.includes("not found");
  }
  return false;
}
