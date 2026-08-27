import dayjs from "dayjs";
import { z } from "zod";

export function isoTimestampNow(): string {
  return dayjs().toISOString();
}

export function parseWithSchema<T>(schema: z.ZodType<T>, value: unknown, message: string): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(message, { cause: error });
    }
    throw error;
  }
}

export function unixTtlFromNow(days: number, now = Date.now()): number {
  return Math.floor(now / 1000) + days * 24 * 60 * 60;
}
