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
import { registerGetPlantsTools } from "./tools/get-plants.js";
import { registerPlantCareGuideTools } from "./tools/get-plant-care-guide.js";
import { registerCheckoutTools } from "./tools/checkout.js";

const app = new Hono();

const mcpServer = Sentry.wrapMcpServerWithSentry(
  new McpServer({
    name: "demo-server",
    version: "1.0.0",
  })
);

registerGetPlantsTools(mcpServer);
registerPlantCareGuideTools(mcpServer);
registerCheckoutTools(mcpServer);

mcpServer.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource", // Display name for UI
    description: "Dynamic greeting generator",
  },
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`,
      },
    ],
  })
);

app.get("/", (c) => c.text("Hello World"));

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
    console.log(`🔗 MCP endpoint: http://localhost:${info.port}/mcp`);
    console.log(`🏠 Home: http://localhost:${info.port}/`);
  }
);
