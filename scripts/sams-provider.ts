#!/usr/bin/env bun
import "varlock/auto-load";
import { parseRegisterArgs, registerConsumer, REGISTER_USAGE } from "../src/cli/register";
import {
  createFullSyncDeps,
  FULL_SYNC_USAGE,
  parseFullSyncArgs,
  runFullSync,
} from "../src/cli/full-sync";

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;

  if (command === "register") {
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
    return;
  }

  if (command === "full-sync") {
    try {
      const args = parseFullSyncArgs(rest);
      await runFullSync(args, createFullSyncDeps());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Full sync failed";
      console.error(message);
      process.exit(1);
    }
    return;
  }

  console.error(`${REGISTER_USAGE}\n${FULL_SYNC_USAGE}`);
  process.exit(1);
}

await main();
