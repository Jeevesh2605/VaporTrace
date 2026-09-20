# VaporTrace — Real-time cloud event debugger for AWS

**Track: Ship It** — deployed and running on live AWS infrastructure.

## The problem

Debugging an event-driven AWS pipeline usually means opening five different
CloudWatch log groups, manually lining up timestamps, and guessing which
invocation caused which failure downstream. There's no single view of a
request's actual journey through S3, EventBridge, and Lambda — you
reconstruct it by hand, every time, from scratch.

## What it does

VaporTrace is a CLI and local dashboard that tunnels live execution traces
from your AWS account straight to your machine. Upload a file, and you
watch the event travel through your pipeline in real time — a live graph
that lights up as each service processes it. If something fails, the
exact node turns red and shows the real error message and stack trace,
one click away. You can then edit the payload right in the dashboard and
push the corrected version back into the pipeline — without touching the
AWS console.

Every trace is also independently cross-verified against real AWS X-Ray,
so what the dashboard shows isn't just our own bookkeeping — it's
confirmed against AWS's own distributed tracing.

## How we built it

**Cloud side (AWS CDK):**
- **S3** — sample event producer
- **EventBridge**, with **Archive + Replay** enabled — routes events and
  keeps a 7-day replay window
- Two **Lambda** functions (forwarder + business-logic processor), both
  with **active X-Ray tracing** enabled
- **IoT Core** — used as an MQTT tunnel, carrying live events out of the
  AWS account to a local machine over TLS

**Local side:**
- A **Node.js CLI** that connects to the IoT tunnel, bridges it to a local
  Server-Sent Events endpoint, and exposes a `/resubmit` route that calls
  `EventBridge.PutEvents` to push corrected payloads back into the cloud
- A **Next.js dashboard** (React Flow) rendering a live, correlated
  trace waterfall — not a guessed diagram, but real spans grouped by a
  shared trace ID
- A small, reusable **tracing SDK** (`vaportrace-sdk.js`) — any Lambda (or
  any Node.js service, via a generic wrapper) becomes traceable by
  VaporTrace with a single line of code, no changes to business logic

We also **published the CLI as a real npm package** (`npm install -g
vaportrace`), so anyone can run it against their own AWS account.

## Challenges we ran into

- **AWS account/region quirks that had nothing to do with our code** —
  `cdk bootstrap` silently failed in `ap-south-1` on a fully-permissioned
  account for reasons we never fully root-caused; switching to `us-east-1`
  resolved it instantly. A good reminder that not every blocker is a bug
  in your own stack.
- **X-Ray's `FacadeSegment`** — inside a Lambda, `AWSXRay.getSegment()`
  returns a read-only facade; calling `.addAnnotation()` directly on it is
  a silent no-op (no error, no effect). The fix was creating an explicit
  subsegment via `captureFunc()` and annotating that instead — a genuinely
  non-obvious AWS SDK behavior that cost real debugging time before we
  found the actual mechanism.
- **IoT Core certificate provisioning** — getting a local CLI to
  authenticate as an MQTT device (X.509 certs, a scoped IoT policy, the
  Data-ATS endpoint) was a multi-step, easy-to-get-wrong process we had to
  work through manually before it became reliable.
- **Deciding what "generalizes" honestly means** — our first instinct was
  a dashboard that inferred a project's architecture purely from event
  metadata. We corrected course toward a real trace/span model instead,
  with inferred spans explicitly labeled `(estimated)` wherever the
  underlying service can't run custom code — accuracy over a flashier but
  misleading demo.

## What we learned

- How to use **IoT Core as a general-purpose pub/sub tunnel**, well outside
  its usual "physical device" use case
- The practical difference between **EventBridge's native Replay** (resends
  an archived payload unmodified) and what we actually needed for a
  fix-and-resubmit workflow (a fresh `PutEvents` call with corrected data)
- How **AWS X-Ray's segment/subsegment model** actually works inside
  Lambda, including a real gotcha that isn't obvious from the docs
- That a lightweight, self-built trace/span protocol — the same conceptual
  shape as OpenTelemetry — is often the right-sized tool for a real
  problem, without needing the full OTel SDK

## What's next

- Extending the same SDK pattern to a non-Lambda pipeline (S3 → SQS → ECS),
  using S3 object metadata to propagate the trace ID where no free
  correlation ID exists
- Automating the current manual IoT certificate setup into a single
  `vaportrace setup` command
- Tightening X-Ray verification latency for services beyond Lambda

## Built with

AWS CDK, EventBridge, Lambda, S3, IoT Core, AWS X-Ray, Node.js, Next.js,
React Flow, npm.

## AI tools used

Claude (Anthropic) — used throughout for architecture discussion,
debugging AWS-specific issues (including the X-Ray subsegment fix above),
and code review.

## Links

- **Repository:** https://github.com/Jeevesh2605/VaporTrace
- **npm package:** https://www.npmjs.com/package/vaportrace
- **Demo video:** https://youtu.be/QxmcdRRcWO0