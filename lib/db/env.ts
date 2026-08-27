/**
 * Shared type-safe configuration for DynamoDB tables.
 */

export const SAMS_TABLE_ENV_VAR = "SAMS_TABLE_NAME" as const;
export const CACHE_TABLE_ENV_VAR = "CACHE_TABLE_NAME" as const;

export function computeResourceBranchSuffix(environment: string, branch: string): string {
  if (environment === "prod") {
    return "";
  }
  return branch ? `-${branch}` : "";
}

export function getSamsTableName(): string {
  const tableName = process.env[SAMS_TABLE_ENV_VAR];
  if (!tableName) {
    throw new Error(
      `SAMS table not configured. Missing environment variable: ${SAMS_TABLE_ENV_VAR}`,
    );
  }
  return tableName;
}

export function getCacheTableName(): string {
  const tableName = process.env[CACHE_TABLE_ENV_VAR];
  if (!tableName) {
    throw new Error(
      `Cache table not configured. Missing environment variable: ${CACHE_TABLE_ENV_VAR}`,
    );
  }
  return tableName;
}

export function computeSamsDataTableName(environment: string, branch: string): string {
  return `sams-provider-data-${environment}${computeResourceBranchSuffix(environment, branch)}`;
}

export function computeCacheTableName(environment: string, branch: string): string {
  return `sams-provider-cache-${environment}${computeResourceBranchSuffix(environment, branch)}`;
}

export function computeLogoBucketName(environment: string, branch: string): string {
  return `sams-provider-logos-${environment}${computeResourceBranchSuffix(environment, branch)}`;
}
