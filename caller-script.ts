// For Node.js EventSource support
import { EventSource } from "eventsource";

interface CallerScriptConfig {
  baseIntervalMs: number;
  serverUrl: string;
  sseUrl: string;
  jitterPercent: number; // 0-100, percentage of jitter to add
  sseUsagePercent: number; // 0-100, percentage of requests to use SSE
}

interface McpItem {
  type: "tool" | "resource" | "prompt";
  name: string;
  args?: Record<string, any>;
}

interface McpRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface McpResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

class CallerScript {
  private config: CallerScriptConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private requestId: number = 1;
  private availableItems: McpItem[] = [
    // Tools (doubled for 2x probability)
    { type: "tool", name: "get-products", args: {} },
    { type: "tool", name: "get-products", args: {} },
    { type: "tool", name: "get-products", args: {} },
    { type: "tool", name: "get-products", args: {} },
    {
      type: "tool",
      name: "get-plant-care-guide",
      args: { plantName: "pothos" },
    },
    {
      type: "tool",
      name: "get-plant-care-guide",
      args: { plantName: "fiddle fig" },
    },
    {
      type: "tool",
      name: "checkout",
      args: { items: [{ productId: 3, quantity: 1 }] },
    },
    {
      type: "tool",
      name: "checkout",
      args: { items: [{ productId: 3, quantity: 1 }] },
    },

    // Resources (normal probability)
    { type: "resource", name: "seasonal-calendar", args: {} },
    { type: "resource", name: "plant-diagnostics", args: {} },
    { type: "resource", name: "plant-diagnostics", args: {} },
    { type: "resource", name: "plant-symptoms", args: {} },
    { type: "resource", name: "plant-symptoms", args: {} },
    { type: "resource", name: "plant-symptoms", args: {} },

    // Prompts (normal probability)
    { type: "prompt", name: "seasonal-care-guide", args: {} },
    { type: "prompt", name: "plant-shopping-assistant", args: {} },
    { type: "prompt", name: "plant-shopping-assistant", args: {} },
    { type: "prompt", name: "new-plant-parent", args: {} },
  ];

  constructor() {
    this.config = {
      baseIntervalMs: 30 * 1000, // Default 30 sec
      serverUrl: `http://localhost:${process.env.PORT || 3000}/mcp`,
      sseUrl: `http://localhost:${process.env.PORT || 3000}/sse`,
      jitterPercent: 30, // 30% jitter by default
      sseUsagePercent: 25, // 25% of requests use SSE
    };
  }

  async start(): Promise<void> {
    try {
      console.log("🎨 Starting caller script...");
      console.log(`📡 HTTP URL: ${this.config.serverUrl}`);
      console.log(`🌊 SSE URL: ${this.config.sseUrl}`);
      console.log(`⏱️  Base interval: ${this.config.baseIntervalMs}ms`);
      console.log(`🎯 Jitter: ±${this.config.jitterPercent}%`);
      console.log(`📡 SSE usage: ${this.config.sseUsagePercent}%`);
      console.log(
        `🎲 Available items: ${this.availableItems.length} (tools, resources, prompts)`
      );

      // Test connection to server
      await this.testConnection();

      // Run immediately once
      await this.executeRandomCall();

      // Start dynamic interval scheduling
      this.scheduleNextCall();

      console.log("✅ Caller script started successfully");
    } catch (error) {
      console.error("❌ Failed to start caller script:", error);
      throw error;
    }
  }

  private scheduleNextCall(): void {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
    }

    const nextInterval = this.calculateNextInterval();
    console.log(
      `⏰ Next call in ${Math.round(
        nextInterval / 1000
      )}s (seasonal: ${this.getSeasonalMultiplier().toFixed(2)}x)`
    );

    this.intervalId = setTimeout(async () => {
      await this.executeRandomCall();
      this.scheduleNextCall(); // Schedule the next call after this one completes
    }, nextInterval);
  }

  async stop(): Promise<void> {
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
    console.log("🛑 Caller script stopped");
  }

  private async testConnection(): Promise<void> {
    try {
      // Test if the MCP server is responding by calling initialize
      const initRequest: McpRequest = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "caller-script-client",
            version: "1.0.0",
          },
        },
      };

      const response = await this.sendMcpRequest(initRequest);

      if (response.error) {
        throw new Error(`MCP initialize failed: ${response.error.message}`);
      }
      console.log("🔗 Connected to MCP server");
    } catch (error) {
      console.error("❌ Failed to connect to MCP server:", error);
      throw error;
    }
  }

  private shouldUseSSE(): boolean {
    return Math.random() * 100 < this.config.sseUsagePercent;
  }

  private async sendMcpRequestHttp(request: McpRequest): Promise<McpResponse> {
    const response = await fetch(this.config.serverUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const responseText = await response.text();

    // Handle SSE format response
    if (responseText.startsWith("event: message\ndata: ")) {
      const jsonData = responseText.split("data: ")[1];
      return JSON.parse(jsonData) as McpResponse;
    }

    // Handle regular JSON response
    return JSON.parse(responseText) as McpResponse;
  }

  private async sendMcpRequestSSE(request: McpRequest): Promise<McpResponse> {
    return new Promise((resolve, reject) => {
      let eventSource: EventSource | null = null;
      let sessionId: string | null = null;
      let hasReceivedResponse = false;
      let connectionEstablished = false;

      const cleanup = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      };

      const timeout = setTimeout(() => {
        if (!hasReceivedResponse) {
          cleanup();
          reject(new Error("SSE request timeout"));
        }
      }, 45000); // Reduced timeout for deployment environments

      try {
        eventSource = new EventSource(this.config.sseUrl);

        eventSource.onopen = () => {
          connectionEstablished = true;
          console.log("🌊 SSE connection opened");
        };

        eventSource.onmessage = async (event) => {
          try {
            // First, try to extract sessionId from event stream
            if (!sessionId && event.data) {
              // Look for sessionId in the data
              const lines = event.data.split("\n");
              for (const line of lines) {
                if (line.includes("sessionId")) {
                  const match = line.match(/"sessionId":\s*"([^"]+)"/);
                  if (match) {
                    sessionId = match[1];
                    console.log(`🔑 Extracted sessionId: ${sessionId}`);
                    break;
                  }
                }
              }
            }

            // If we have a sessionId and haven't sent the request yet, send it
            if (sessionId && !hasReceivedResponse) {
              try {
                const baseUrl = this.config.sseUrl.replace("/sse", "");
                const response = await fetch(
                  `${baseUrl}/messages?sessionId=${sessionId}`,
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(request),
                  }
                );

                if (!response.ok) {
                  throw new Error(`HTTP error! status: ${response.status}`);
                }
                console.log("📤 Request sent to /messages endpoint");
              } catch (error) {
                clearTimeout(timeout);
                cleanup();
                reject(new Error(`Failed to send message: ${error}`));
                return;
              }
            }

            // Try to parse as JSON response
            try {
              const data = JSON.parse(event.data);
              if (
                data.jsonrpc &&
                data.id === request.id &&
                !hasReceivedResponse
              ) {
                hasReceivedResponse = true;
                clearTimeout(timeout);
                cleanup();
                resolve(data as McpResponse);
                return;
              }
            } catch {
              // Not JSON, might be session establishment or other data
            }
          } catch (error) {
            if (!hasReceivedResponse) {
              clearTimeout(timeout);
              cleanup();
              reject(new Error(`Failed to process SSE message: ${error}`));
            }
          }
        };

        eventSource.onerror = (error) => {
          console.log(`🚨 SSE error: ${JSON.stringify(error)}`);
          if (!hasReceivedResponse) {
            clearTimeout(timeout);
            cleanup();
            // In deployment environments, fall back to HTTP on SSE failure
            console.log("🔄 SSE failed, falling back to HTTP");
            this.sendMcpRequestHttp(request).then(resolve).catch(reject);
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`Failed to establish SSE connection: ${error}`));
      }
    });
  }

  private async sendMcpRequest(request: McpRequest): Promise<McpResponse> {
    const useSSE = this.shouldUseSSE();

    if (useSSE) {
      return this.sendMcpRequestSSE(request);
    } else {
      return this.sendMcpRequestHttp(request);
    }
  }

  private getRandomItem(): McpItem {
    const randomIndex = Math.floor(Math.random() * this.availableItems.length);
    return this.availableItems[randomIndex];
  }

  private getSeasonalMultiplier(): number {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // Time of day seasonality (peak hours have faster intervals)
    let timeMultiplier = 1.0;
    if (hour >= 9 && hour <= 17) {
      // Business hours - more active
      timeMultiplier = 0.7; // 30% faster
    } else if (hour >= 18 && hour <= 22) {
      // Evening - moderate activity
      timeMultiplier = 0.9; // 10% faster
    } else {
      // Night/early morning - slower
      timeMultiplier = 1.5; // 50% slower
    }

    // Day of week seasonality
    let dayMultiplier = 1.0;
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // Weekdays - more active
      dayMultiplier = 0.8; // 20% faster
    } else {
      // Weekends - slower
      dayMultiplier = 1.3; // 30% slower
    }

    return timeMultiplier * dayMultiplier;
  }

  private addJitter(baseValue: number): number {
    const jitterAmount = (this.config.jitterPercent / 100) * baseValue;
    const randomJitter = (Math.random() - 0.5) * 2 * jitterAmount; // -jitter to +jitter
    return Math.max(1000, baseValue + randomJitter); // Minimum 1 second
  }

  private calculateNextInterval(): number {
    const seasonalInterval =
      this.config.baseIntervalMs * this.getSeasonalMultiplier();
    return this.addJitter(seasonalInterval);
  }

  private getMethodForType(type: string): string {
    switch (type) {
      case "tool":
        return "tools/call";
      case "resource":
        return "resources/read";
      case "prompt":
        return "prompts/get";
      default:
        throw new Error(`Unknown type: ${type}`);
    }
  }

  private getEmojiForType(type: string): string {
    switch (type) {
      case "tool":
        return "🔧";
      case "resource":
        return "📚";
      case "prompt":
        return "💬";
      default:
        return "❓";
    }
  }

  private async executeRandomCall(): Promise<void> {
    try {
      const item = this.getRandomItem();
      const timestamp = new Date().toISOString();
      const emoji = this.getEmojiForType(item.type);
      const useSSE = this.shouldUseSSE();
      const transportEmoji = useSSE ? "🌊" : "📡";
      const transportName = useSSE ? "SSE" : "HTTP";

      console.log(
        `\n${emoji} [${timestamp}] ${transportEmoji} ${transportName} - Calling ${item.type}: ${item.name}`
      );

      const method = this.getMethodForType(item.type);
      const mcpRequest: McpRequest = {
        jsonrpc: "2.0",
        id: this.requestId++,
        method,
        params:
          item.type === "resource"
            ? { uri: `empower://${item.name}`, name: item.name }
            : { name: item.name, arguments: item.args || {} },
      };

      const response = useSSE
        ? await this.sendMcpRequestSSE(mcpRequest)
        : await this.sendMcpRequestHttp(mcpRequest);

      if (response.error) {
        console.log(`❌ Failed - ${response.error.message}`);
        return;
      }

      console.log(`✅ Success`);
    } catch (error) {
      console.log(
        `❌ Failed - ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  updateConfig(newConfig: Partial<CallerScriptConfig>): void {
    this.config = { ...this.config, ...newConfig };

    // If base interval changed and script is running, reschedule next call
    if (this.intervalId && newConfig.baseIntervalMs) {
      console.log(
        `⏱️  Updated base interval to ${this.config.baseIntervalMs}ms`
      );
      this.scheduleNextCall(); // This will clear the current timeout and schedule a new one
    }
  }
}

// Export for use in other modules
export { CallerScript, CallerScriptConfig };

// CLI functionality when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const callerScript = new CallerScript();

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n🛑 Received SIGINT, shutting down gracefully...");
    await callerScript.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
    await callerScript.stop();
    process.exit(0);
  });

  // Start the caller script
  callerScript.start().catch((error) => {
    console.error("❌ Failed to start caller script:", error);
    process.exit(1);
  });
}
