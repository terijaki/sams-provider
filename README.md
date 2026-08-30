# SAMS provider

Event-fed volleyball data from SAMS. This service syncs clubs, teams, matches, and rankings, then delivers **app-oriented events to an SQS queue in your AWS account**.

There is **no public read API** and no proxy you can query. Your website (or other app) keeps its own local copy of the data and updates it from those events.

## Why register

SAMS is the upstream volleyball information system. Calling it directly from every club site means building your own polling, logo hosting, multi-association indexing, and match refresh logic. The provider does that work once and ships **normalized projections** your app can store locally.

After registration you receive:

- **Club profile** updates (name, association, public logo URL)
- **Current-season teams** for your registered club
- **Match schedule and results** with adaptive refresh near game time
- **League rankings** aligned with match updates

You keep a **local projection** in your database or cache and update it from SQS messages. Live match ticker stays in your app — the provider does not publish ticker data.

Install TypeScript types and Zod schemas from npm:

```bash
bun add sams-provider-events
```

See [docs/consumers/events.md](docs/consumers/events.md) for a full event reference.

## Get events for your club

1. Deploy the queue described below in your AWS account.
2. Open a **[Register as a consumer](https://github.com/terijaki/sams-provider/issues/new?template=consumer-registration.yml)** issue.
3. A maintainer wires the event bus to your queue. Re-runs are safe if something needs correcting.

After that, events arrive on your queue. You still need a processor in **your** app to turn the versioned envelopes into your own projections. Use the [`sams-provider-events`](https://www.npmjs.com/package/sams-provider-events) npm package for types, Zod schemas, and SQS parsing — see [docs/consumers/events.md](docs/consumers/events.md) for prose documentation.

### What to put on the issue

| Field          | What to send                                                                   |
| -------------- | ------------------------------------------------------------------------------ |
| Club           | Exact SAMS club name, or the club's 36-character UUID if the name is ambiguous |
| AWS account ID | 12-digit account that owns the queue                                           |
| Queue ARN      | Full SQS ARN of the events queue                                               |

## What you deploy

Create these in **your** AWS account, in `eu-central-1` (Frankfurt). This repository does not create consumer queues. The queue can have any name; paste its ARN on the issue.

- An SQS queue
- A queue resource policy that lets the provider event bus send messages

A dead-letter queue is recommended so failed processor runs do not drop messages. It is not required for registration.

Provider event bus:

```text
arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider
```

Deploy the queue **before** you open the issue. Registration fails until the queue exists and the policy allows that bus.

### Queue policy (CDK)

```ts
import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";

const dlq = new sqs.Queue(this, "SamsProviderEventsDlq", {
  retentionPeriod: Duration.days(14),
});

const queue = new sqs.Queue(this, "SamsProviderEvents", {
  deadLetterQueue: { maxReceiveCount: 5, queue: dlq },
});

queue.addToResourcePolicy(
  new iam.PolicyStatement({
    sid: "AllowSamsProviderDeliveryRole",
    principals: [new iam.ArnPrincipal("arn:aws:iam::550271577754:role/sp-event-delivery-prod")],
    actions: ["sqs:SendMessage"],
    resources: [queue.queueArn],
  }),
);
```

The same policy in JSON (replace the queue ARN with yours):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSamsProviderDeliveryRole",
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::550271577754:role/sp-event-delivery-prod"
      },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:eu-central-1:123456789012:your-queue"
    }
  ]
}
```

Cross-account delivery uses the provider **execution role** above (`sp-event-delivery-prod` in prod). EventBridge assumes that role when invoking your queue. Granting only the event bus ARN or `events.amazonaws.com` as principal is not sufficient.

Terraform, CloudFormation, or the console are fine as long as the region and policy match.

If you run more than one AWS account (for example your own staging site and production site), deploy a queue in **each** account that should receive events and open one registration issue per account.
