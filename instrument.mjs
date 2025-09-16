import * as Sentry from "@sentry/node";
// const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://9014a182b36f57011af3b20f927d179c@o4509089275772928.ingest.de.sentry.io/4510028461703248",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
});
