CDK stacks live here. Naming: prod `Foo-Prod`, shared dev `Foo-Dev-main`, feature `Foo-Dev-<branch>`.

Do not inject `SAMS_API_KEY` into Lambda environment variables. Grant `ssm:GetParameter` on `/sams-provider/{env}/*` instead.
