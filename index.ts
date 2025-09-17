import "./instrument.mjs";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import * as Sentry from "@sentry/node";
import { StreamableHTTPTransport } from "@hono/mcp";
import { streamSSE } from "hono/streaming";
import { SSETransport } from "hono-mcp-server-sse-transport";

import { serve } from "@hono/node-server";
import { getProductsTool } from "./tools/get-products.js";
import { getPlantCareGuideTool } from "./tools/get-plant-care-guide.js";
import { checkoutTool } from "./tools/checkout.js";
import { seasonalCalendarResource } from "./resources/seasonal-calendar.js";
import { plantDiagnosticsResource } from "./resources/plant-diagnostics.js";
import { plantCareAssistantPrompt } from "./prompts/plant-care-assistant.js";
import { diagnosePlantProblemPrompt } from "./prompts/diagnose-plant-problem.js";
import { seasonalCareGuidePrompt } from "./prompts/seasonal-care-guide.js";
import { plantShoppingAssistantPrompt } from "./prompts/plant-shopping-assistant.js";
import { newPlantParentPrompt } from "./prompts/new-plant-parent.js";
import { plantSymptomsResource } from "./resources/plant-symptoms.js";

const app = new Hono();

const mcpServer = Sentry.wrapMcpServerWithSentry(
  new McpServer({
    name: "demo-server",
    version: "1.0.0",
  })
);

mcpServer.registerTool(
  "get-products",
  getProductsTool,
  getProductsTool.handler
);
mcpServer.registerTool(
  "get-plant-care-guide",
  getPlantCareGuideTool,
  getPlantCareGuideTool.handler
);
mcpServer.registerTool("checkout", checkoutTool, checkoutTool.handler);

mcpServer.registerResource(
  "seasonal-calendar",
  seasonalCalendarResource.template,
  seasonalCalendarResource.metadata,
  seasonalCalendarResource.handler
);
mcpServer.registerResource(
  "plant-diagnostics",
  plantDiagnosticsResource.template,
  plantDiagnosticsResource.metadata,
  plantDiagnosticsResource.handler
);
mcpServer.registerResource(
  "plant-symptoms",
  plantSymptomsResource.template,
  plantSymptomsResource.metadata,
  plantSymptomsResource.handler
);

mcpServer.registerPrompt(
  "seasonal-care-guide",
  seasonalCareGuidePrompt.metadata,
  seasonalCareGuidePrompt.handler
);
mcpServer.registerPrompt(
  "plant-shopping-assistant",
  plantShoppingAssistantPrompt.metadata,
  plantShoppingAssistantPrompt.handler
);
mcpServer.registerPrompt(
  "new-plant-parent",
  newPlantParentPrompt.metadata,
  newPlantParentPrompt.handler
);

app.get("/", (c) =>
  c.html(`
  <h1>Empower Plant MCP Server</h1>
  <p>This is a MCP server for the Empower Plant API.</p>
  <p>It is a work in progress and is not yet ready for production.</p>
  <p>It is currently only available over SSE and Streamable HTTP.</p>
  <p>You can use the following endpoints to interact with the server:</p>
  <ul>
    <li><<a href=>"/mcp">MCP Streamable HTTP</a></li>
    <li><a href="/sse">MCP SSE</a></li>
  </ul>
  <p>You can use MCP inspector to interact with the server.</p>
  <p>Run:</p>
  <pre>npx @modelcontextprotocol/inspector</pre>
  `)
);

app.all("/mcp", async (c) => {
  const transport = new StreamableHTTPTransport();
  await mcpServer.connect(transport);
  return transport.handleRequest(c);
});

// to support multiple simultaneous connections we have a lookup object from
// sessionId to transport
const transports: { [sessionId: string]: SSETransport } = {};

app.get("/sse", (c) => {
  return streamSSE(c, async (stream) => {
    const transport = new SSETransport("/messages", stream);

    transports[transport.sessionId] = transport;

    stream.onAbort(() => {
      delete transports[transport.sessionId];
    });

    await mcpServer.connect(transport);

    while (true) {
      // This will keep the connection alive
      // You can also await for a promise that never resolves
      await stream.sleep(60_000);
    }
  });
});

app.post("/messages", async (c) => {
  const sessionId = c.req.query("sessionId");

  if (!sessionId) {
    return c.text("sessionId is required", 400);
  }

  const transport = transports[sessionId];

  if (transport == null) {
    return c.text("No transport found for sessionId", 400);
  }

  return await transport.handlePostMessage(c);
});

const port = process.env.PORT || 3000;

console.log(`🚀 MCP Server starting...`);

serve(
  {
    fetch: app.fetch,
    port: Number(port),
  },
  (info) => {
    console.log(`📡 Server running on port ${info.port}`);
    console.log(
      `🔗 MCP Streamable HTTP endpoint: http://localhost:${info.port}/mcp`
    );
    console.log(`🔗 MCP SSE endpoint: http://localhost:${info.port}/sse`);
    console.log(`🏠 Home: http://localhost:${info.port}/`);
  }
);
