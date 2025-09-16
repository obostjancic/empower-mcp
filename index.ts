import "./instrument.mjs";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Hono } from "hono";
import * as Sentry from "@sentry/node";
import { StreamableHTTPTransport } from "@hono/mcp";
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
