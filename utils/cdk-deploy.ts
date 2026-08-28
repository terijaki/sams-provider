/**
 * Whether the environment-scoped Monitoring stack should be part of an app deploy.
 *
 * Prod always gets it; dev only on shared-dev (empty branch / main).
 * Feature-branch deploys skip it because monitoring is not needed in dev sandboxes.
 */
export function shouldDeployMonitoringStack(args: { isProd: boolean; branch: string }): boolean {
  return args.isProd || !args.branch;
}
