# vaportrace

**Real-time cloud event debugger for AWS — like ngrok, but for AWS events.**

`vaportrace` is a CLI that tunnels live execution traces from your AWS
account to a local dashboard, so you can watch an event-driven pipeline
run in real time and see exactly where it fails — without digging through
CloudWatch.

It connects to **your own AWS account**. Like `ngrok` or the AWS SAM CLI,
it runs on your machine and streams your own private cloud activity to you
— there's no shared or hosted version.

## Prerequisites

Before using this CLI, you need the VaporTrace AWS infrastructure deployed
in your own account (EventBridge, the traced Lambdas, and the IoT Core
tunnel). See the full setup guide:
👉 👉 [VaporTrace on GitHub](https://github.com/Jeevesh2605/VaporTrace)

You'll also need Node.js 18 or later.

## Install

```bash
npm install -g vaportrace
```

## One-time setup

Provision a local MQTT certificate so the CLI can connect to your IoT Core
tunnel:

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

Copy the endpoint hostname printed by the last command — you'll need it below.

## Usage

```bash
export VAPORTRACE_IOT_ENDPOINT=<your-endpoint-from-setup>
vaportrace start
```

This starts:
- an MQTT client, subscribed to your IoT Core tunnel
- a local server at `http://localhost:4000`, streaming events over
  Server-Sent Events for the dashboard
- an `/resubmit` endpoint the dashboard uses to push edited payloads
  back into your EventBridge bus

Then run the [VaporTrace dashboard](https://github.com/Jeevesh2605/VaporTrace/tree/main/packages/dashboard)
separately and open `http://localhost:3000` to watch traces live.

## Configuration

| Environment variable | Required | Description |
|---|---|---|
| `VAPORTRACE_IOT_ENDPOINT` | Yes | Your account's IoT Core Data-ATS endpoint |
| `PORT` | No | Local server port (default `4000`) |
| `AWS_REGION` | Yes | Must match the region you deployed the infra to |

Standard AWS credential resolution applies (`~/.aws/credentials`, env vars,
or an SSO profile) — the CLI needs permission to call EventBridge
(`PutEvents`) and X-Ray (`GetServiceGraph`, `GetTraceSummaries`).

## Extending this to your own Lambdas

Any Lambda becomes traceable by VaporTrace with one line, using the SDK
included in the infra repo:

```js
const { withVaporTrace } = require("./vaportrace-sdk");

exports.handler = withVaporTrace("MyService", async (event, context) => {
  // your existing code, unchanged
});
```

## License

MIT