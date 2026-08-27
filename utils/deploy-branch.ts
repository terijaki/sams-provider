import { sanitizeBranchName } from "./branch";

function resolveRawBranchName(): string | undefined {
  if (process.env.CDK_BRANCH_OVERWRITE) {
    return process.env.CDK_BRANCH_OVERWRITE;
  }

  if (process.env.BRANCH_NAME) {
    return process.env.BRANCH_NAME;
  }

  return undefined;
}

/**
 * Resolve the deployment branch suffix for AWS resource naming.
 *
 * Resolution order:
 * 1. CDK_BRANCH_OVERWRITE — explicit override (CI, scripts)
 * 2. BRANCH_NAME — Varlock ($VARLOCK_BRANCH)
 *
 * Returns empty string on main (unless includeMain) or when branch cannot be resolved.
 */
export function getSanitizedBranch(includeMain = false): string {
  const branch = resolveRawBranchName();
  if (!branch) {
    return "";
  }

  if (!includeMain && branch === "main") {
    return "";
  }

  return sanitizeBranchName(branch);
}
