# VaporTrace

[![npm version](https://img.shields.io/npm/v/vaportrace.svg)](https://www.npmjs.com/package/vaportrace)

**Real-time cloud event debugger for AWS — like ngrok, but for AWS events.**

VaporTrace streams live execution traces from your AWS account straight to a
local dashboard, so you can watch an event-driven pipeline execute in real
time, see exactly where it fails, and fix + resubmit the corrected payload —
all without leaving your terminal.

![VaporTrace architecture](./architecture.svg)

## Why

Debugging a serverless pipeline usually means opening five CloudWatch log
groups, lining up timestamps by hand, and guessing which invocation caused
which failure. VaporTrace replaces that with one correlated view: every hop
a single event takes, drawn as a live waterfall, with the real error message
and stack trace one click away.

It's built on a lightweight trace/span model — the same conceptual shape as
OpenTelemetry (trace → spans → status → duration) — plus real AWS X-Ray
annotations for independent verification on Lambda-based services.

## What it looks like

- A live graph of every service an event passed through, updating in
  real time as it happens
- Failed spans shown in red, with the exact error and stack trace
- An **Edit & Resubmit** flow: fix a bad payload right in the dashboard and
  push it back into the pipeline without touching the AWS console
- Every retry is linked back to the trace it's fixing, so you can see the
  whole story — failed, fixed, resolved

## How it works

1. **S3** receives an upload and fires an event
2. **EventBridge** (with Archive + Replay enabled) routes it to two Lambdas
3. **Forwarder Lambda** relays the raw event and reports a span
4. **Processor Lambda** runs your business logic and reports its own span —
   success or failure
5. Both publish over **IoT Core** (MQTT), which tunnels straight to your
   machine
6. The **VaporTrace CLI** picks it up and streams it to your **local
   dashboard** over Server-Sent Events

Nothing is guessed. Every span is either a real measured Lambda execution,
or clearly labeled `(estimated)` when it represents a managed service (like
S3 or EventBridge itself) that can't run custom code.

## Getting started

### 1. Deploy the AWS infrastructure

```bash
git clone https://github.com/<your-username>/CloudTrace.git
cd CloudTrace/packages/infra
npm install
cdk bootstrap aws://<your-account-id>/<your-region>
cdk deploy
```

This creates the S3 bucket, EventBridge bus, both Lambdas, and the IoT Core
tunnel in your own AWS account.

### 2. Provision your local MQTT credentials (one-time)

```bash
mkdir -p ~/.vaportrace/certs && cd ~/.vaportrace/certs

aws iot create-keys-and-certificate --set-as-active \
  --certificate-pem-outfile device-cert.pem.crt \
  --public-key-outfile device-public.pem.key \
  --private-key-outfile device-private.pem.key \
  > cert-output.json

aws iot attach-policy --policy-name vaportrace-device-policy \
  --target "$(grep certificateArn cert-output.json | cut -d'"' -f4)"

curl -o AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem

aws iot describe-endpoint --endpoint-type iot:Data-ATS
```

Copy the endpoint hostname printed by the last command — you'll need it next.

### 3. Install and run the CLI

```bash
npm install -g vaportrace
export VAPORTRACE_IOT_ENDPOINT=<the endpoint from step 2>
vaportrace start
```

📦 [vaportrace on npm](https://www.npmjs.com/package/vaportrace)

### 4. Run the dashboard

```bash
cd CloudTrace/packages/dashboard
npm install
npm run dev
```

Open `http://localhost:3000`, then upload a file to the S3 bucket created in
step 1. Watch it trace live.

## Extending this to your own project

Any Lambda becomes traceable with one line:

```js
const { withVaporTrace } = require("./vaportrace-sdk");

exports.handler = withVaporTrace("MyService", async (event, context) => {
  // your existing code, unchanged
});
```

For a non-Lambda service (ECS, a worker process), use `traceOperation()`
from the same SDK file. The only thing you add per hop is the trace ID
itself — carried forward via an EventBridge event's `id`, an SQS message
attribute, or S3 object metadata, depending on what's connecting the two
services.

## Project structure

```
packages/
  infra/       AWS CDK stack — S3, EventBridge, Lambdas, IoT Core
  cli/         Local CLI — MQTT client, SSE server, resubmit endpoint
  dashboard/   Next.js dashboard — live trace waterfall, span inspector
```

## Known limitations

- X-Ray verification only applies to Lambda-based services with active
  tracing enabled, and can lag 30–90 seconds behind real time due to AWS's
  own trace indexing.
- Trace correlation across non-Lambda hops (SQS, ECS, DynamoDB) requires
  explicitly propagating the trace ID at that hop — it isn't automatic.
- The dashboard and CLI run locally, by design — like `ngrok` or the AWS
  SAM CLI, VaporTrace connects to *your* AWS account and streams *your*
  private event data to *your* machine. There's intentionally no hosted,
  multi-tenant version.

## Built with

AWS CDK, EventBridge, Lambda, S3, IoT Core, AWS X-Ray, Next.js, React Flow.
Published as a standalone [npm package](https://www.npmjs.com/package/vaportrace)
so anyone can install and run it against their own AWS account.

Built with the help of Claude (Anthropic) for architecture discussion,
debugging, and code review throughout.

## License

MIT