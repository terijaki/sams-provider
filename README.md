# SAMS provider

Event-fed volleyball data from [SAMS](https://www.volleyball-baden.de) (Südbadischer Volleyball-Verband). This service syncs clubs, teams, matches, and rankings, then delivers **app-oriented events to an SQS queue in your AWS account**.

There is **no public read API** and no proxy you can query. Your website (or other app) keeps its own local copy of the data and updates it from those events.

## Get events for your club

Registration always targets the **production** provider account. You do not register against a provider "dev" environment.

1. Deploy the queue described below in your AWS account.
2. Open a **[Register as a consumer](https://github.com/terijaki/sams-provider/issues/new?template=consumer-registration.yml)** issue.
3. A maintainer wires the production event bus to your queue. Re-runs are safe if something needs correcting.

After that, events arrive on your queue. You still need a processor in **your** app to turn the versioned envelopes into your own projections. Payload shapes live in [`src/events/schemas.ts`](src/events/schemas.ts). Match ticker stays in your app; this service does not provide one.

### What to put on the issue

| Field          | What to send                                                                   |
| -------------- | ------------------------------------------------------------------------------ |
| Club           | Exact SAMS club name, or the club's 36-character UUID if the name is ambiguous |
| AWS account ID | 12-digit account that owns the queue                                           |
| Queue ARN      | Full SQS ARN of the events queue                                               |

## What you deploy

Create these in **your** AWS account, in `eu-central-1` (Frankfurt). This repository does not create consumer queues.

- SQS queue named `sams-provider-events`
- A queue resource policy that lets the production provider event bus send messages

A dead-letter queue is recommended so failed processor runs do not drop messages. It is not required for registration.

Production event bus:

```text
arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider
```

Default queue ARN (replace with your account ID):

```text
arn:aws:sqs:eu-central-1:123456789012:sams-provider-events
```

Deploy the queue **before** you open the issue. Registration fails until the queue exists and the policy allows the bus below.

### Queue policy (CDK)

```ts
import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";

const dlq = new sqs.Queue(this, "SamsProviderEventsDlq", {
  queueName: "sams-provider-events-dlq",
  retentionPeriod: Duration.days(14),
});

const queue = new sqs.Queue(this, "SamsProviderEvents", {
  queueName: "sams-provider-events",
  deadLetterQueue: { maxReceiveCount: 5, queue: dlq },
});

queue.addToResourcePolicy(
  new iam.PolicyStatement({
    sid: "AllowSamsProviderProdEventBus",
    principals: [new iam.ServicePrincipal("events.amazonaws.com")],
    actions: ["sqs:SendMessage"],
    resources: [queue.queueArn],
    conditions: {
      ArnEquals: {
        "aws:SourceArn": "arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider",
      },
      StringEquals: {
        "aws:SourceAccount": "550271577754",
      },
    },
  }),
);
```

The same policy in JSON:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowSamsProviderProdEventBus",
      "Effect": "Allow",
      "Principal": { "Service": "events.amazonaws.com" },
      "Action": "sqs:SendMessage",
      "Resource": "arn:aws:sqs:eu-central-1:123456789012:sams-provider-events",
      "Condition": {
        "ArnEquals": {
          "aws:SourceArn": "arn:aws:events:eu-central-1:550271577754:event-bus/sams-provider"
        },
        "StringEquals": {
          "aws:SourceAccount": "550271577754"
        }
      }
    }
  ]
}
```

Replace `123456789012` with your account ID. Terraform, CloudFormation, or the console are fine as long as the queue name, region, and policy match.

If you run more than one AWS account (for example your own staging site and production site), deploy this queue in **each** account that should receive events and open one registration issue per account. Both are registered on the production provider, not on a provider dev bus.

---

## Maintainers

Club onboarding is above. Local setup, AWS accounts, CI, and the register CLI live under [docs/](docs/README.md).
