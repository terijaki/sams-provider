CDK lives here: stacks in `lib/stacks/`, shared constructs in `lib/construct/`, DynamoDB helpers in `lib/db/`.

Two synth groups (`CDK_STACK_GROUP`):

- **`app` (default):** Data, Media, Event, Sync, and Monitoring (prod / shared-dev only). CloudFormation names: prod `Foo-Prod`, shared-dev `Foo-Dev-main`, feature `Foo-Dev-<branch>`.
- **`shared`:** account singletons `GitHubOidcStack` and `BudgetStack` (`Foo-Dev` / `Foo-Prod`, no branch). Termination-protected. Deploy with `cdk:deploy:shared`. Never include them in default `cdk deploy --all`.

Do not inject `SAMS_API_KEY` into Lambda environment variables. Grant `ssm:GetParameter` on `/sams-provider/{env}/*` and `/sams-provider/sams/api-key` instead.
