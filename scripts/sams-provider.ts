#!/usr/bin/env bun
import "varlock/auto-load";
import { parseRegisterArgs, registerConsumer, REGISTER_USAGE } from "../src/cli/register";

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (command !== "register") {
    console.error(REGISTER_USAGE);
    process.exit(1);
  }

  try {
    const result = await registerConsumer(parseRegisterArgs(rest));
    console.log(
      JSON.stringify(
        {
          club: result.club,
          consumer: result.consumer,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    console.error(message);
    process.exit(1);
  }
}

await main();
