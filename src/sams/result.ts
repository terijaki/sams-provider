/** Narrow a sams-rest-v2 result union to a data/error pair. */
export function unwrapSamsResult<T>(result: {
  data?: T;
}): { data: T; error?: undefined } | { data?: undefined; error: { message: string } } {
  if ("error" in result && result.error) {
    const failed = result.error;
    const message =
      typeof failed === "object" &&
      failed !== null &&
      "message" in failed &&
      typeof failed.message === "string"
        ? failed.message
        : "SAMS request failed";
    return { error: { message } };
  }
  if (result.data !== undefined) {
    return { data: result.data };
  }
  return { error: { message: "SAMS request returned no data" } };
}
