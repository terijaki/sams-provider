#!/usr/bin/env bun
import "varlock/auto-load";
import { registerConsumer } from "../src/cli/register";

function readFlag(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(`--${name}`);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

async function main(): Promise<void> {
  const [, , command, ...rest] = process.argv;
  if (command !== "register") {
    console.error(`Usage: sams-provider register --club "Club Name" --account 123456789012`);
    process.exit(1);
  }

  const club = readFlag(rest, "club");
  const account = readFlag(rest, "account");
  if (!club || !account) {
    console.error(`Usage: sams-provider register --club "Club Name" --account 123456789012`);
    process.exit(1);
  }

  const result = await registerConsumer({
    club,
    account,
    consumerId: readFlag(rest, "consumer-id"),
    queueArn: readFlag(rest, "queue-arn"),
    environment: (readFlag(rest, "environment") as "dev" | "prod" | undefined) ?? "dev",
  });
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
}

await main();
