// vaportrace-sdk.js
// Drop this single file into ANY Lambda's source folder (this project or another)
// to make it traceable by VaporTrace. No other code changes required.

const AWSXRay = require("aws-xray-sdk-core");
const { IoTDataPlaneClient, PublishCommand } = require("@aws-sdk/client-iot-data-plane");

const iotClient = AWSXRay.captureAWSv3Client(new IoTDataPlaneClient({}));
const TOPIC_PREFIX = process.env.VAPORTRACE_TOPIC_PREFIX || "vaportrace/events";

/**
 * Publishes a raw event onto the VaporTrace tunnel (for the CLI/dashboard's
 * "rawEvent" tracking and virtual-span inference). Optional — only relevant
 * for the entry-point service of a pipeline (e.g. the forwarder).
 */
async function publishRawEvent(event) {
  const topic = `${TOPIC_PREFIX}/${event["detail-type"] || "unknown"}`;
  await iotClient.send(
    new PublishCommand({
      topic,
      payload: Buffer.from(JSON.stringify(event)),
      qos: 0,
    })
  );
}

/**
 * Publishes a structured span report. This is the core primitive —
 * every service that wants to appear on the VaporTrace dashboard calls this.
 */
async function reportSpan(span) {
  try {
    await iotClient.send(
      new PublishCommand({
        topic: `${TOPIC_PREFIX}/span`,
        payload: Buffer.from(
          JSON.stringify({ "detail-type": "Span Report", source: "vaportrace.sdk", detail: span })
        ),
        qos: 0,
      })
    );
  } catch (e) {
    console.error("[vaportrace-sdk] span report failed (non-fatal):", e.message);
  }
}

/**
 * Tags the current X-Ray segment with the trace ID so the CLI can later
 * confirm this exact trace was captured by real AWS X-Ray (honest verification,
 * not a guess). Safe no-op if X-Ray isn't active for this invocation.
 */
function annotateXRaySegment(traceId) {
    if (!traceId) return;
    try {
      AWSXRay.captureFunc("vaportrace-annotation", (subsegment) => {
        subsegment.addAnnotation("vaporTraceId", traceId);
      });
    } catch (e) {
      console.error("[vaportrace-sdk] X-Ray annotation failed (non-fatal):", e.message);
    }
  }

/**
 * Extracts a trace ID from whatever triggered this invocation.
 * This is the propagation "golden rule" made concrete: add a case here
 * for any new trigger source (SQS, API Gateway, etc.) as you adopt them.
 */
function extractTraceId(event, context) {
  return (
    event.id ||                                                    // EventBridge
    event.Records?.[0]?.messageAttributes?.traceId?.stringValue ||  // SQS
    event.headers?.["x-vaportrace-trace-id"] ||                     // API Gateway / HTTP
    context.awsRequestId                                            // fallback: starts a new trace here
  );
}

/**
 * Convenience wrapper for the common case: trace a Lambda handler with
 * zero changes to its business logic. Reports timing/status automatically;
 * does NOT swallow errors — your Lambda still fails normally.
 *
 * Usage in ANY project:
 *   const { withVaporTrace } = require("./vaportrace-sdk");
 *   exports.handler = withVaporTrace("MyService", async (event, context) => { ... });
 */
function withVaporTrace(serviceName, handler) {
  return async (event, context) => {
    const start = Date.now();
    const startTime = new Date().toISOString();
    const traceId = extractTraceId(event, context);
    annotateXRaySegment(traceId);

    let status = "ok";
    let error = null;

    try {
      return await handler(event, context);
    } catch (err) {
      status = "error";
      error = { message: err.message, stack: err.stack };
      throw err;
    } finally {
      await reportSpan({
        traceId,
        spanId: context.awsRequestId,
        service: serviceName,
        startTime,
        endTime: new Date().toISOString(),
        durationMs: Date.now() - start,
        status,
        error,
        attributes: { requestId: context.awsRequestId },
      });
    }
  };
}

module.exports = { iotClient, publishRawEvent, reportSpan, annotateXRaySegment, extractTraceId, withVaporTrace };