CDK lives here: stacks in `lib/stacks/`, shared constructs in `lib/construct/`, DynamoDB helpers in `lib/db/`.

Stack CloudFormation names: prod `Foo-Prod`, shared dev `Foo-Dev-main`, feature `Foo-Dev-<branch>`.

`GitHubOidcStack` is account-scoped (`GitHubOidcStack-Dev` / `GitHubOidcStack-Prod`), termination-protected, and only instantiated when `CDK_DEPLOY_GITHUB_OIDC=true`. Never include it in `cdk deploy --all`.

Do not inject `SAMS_API_KEY` into Lambda environment variables. Grant `ssm:GetParameter` on `/sams-provider/{env}/*` instead.
