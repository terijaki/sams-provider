/**
 * Whether account-baseline stacks (Budget, Monitoring) should be deployed.
 *
 * Prod always gets them; dev only on shared-dev (empty branch / main).
 */
export function shouldDeployAccountOpsStacks(args: { isProd: boolean; branch: string }): boolean {
  return args.isProd || !args.branch;
}
