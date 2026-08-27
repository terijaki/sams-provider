/**
 * Sanitize a branch name for use in AWS resource names.
 * Lowercases, replaces non-alphanumeric characters with hyphens, and truncates to 20 chars.
 */
export function sanitizeBranchName(branch: string): string {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .substring(0, 20)
    .replace(/-+$/, "");
}
