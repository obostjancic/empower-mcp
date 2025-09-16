import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PlantProduct, PlantProductSummary } from "../types.js";
import { EMPOWER_PLANT_API_URL } from "../consts.js";

export function registerGetPlantsTools(server: McpServer) {
  server.registerTool(
    "get-plants",
    {
      title: "Get Plant Products",
      annotations: {
        description: "Get a list of plant products from Empower Plant store",
      },
      inputSchema: {},
    },
    async () => {
      try {
        const plants = await fetchPlantProducts();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(plants, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error fetching plant products: ${
                error instanceof Error ? error.message : "Unknown error"
              }`,
            },
          ],
        };
      }
    }
  );
}

async function fetchPlantProducts(): Promise<PlantProductSummary[]> {
  const response = await fetch(`${EMPOWER_PLANT_API_URL}/products`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const products: PlantProduct[] = await response.json();

  const summaries: PlantProductSummary[] = products.map((product) => ({
    id: product.id,
    title: product.title,
    description: product.description,
    price: product.price,
  }));

  return summaries;
}
