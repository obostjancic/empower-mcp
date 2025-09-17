import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { PlantProduct, PlantProductSummary } from "../types.js";
import { EMPOWER_PLANT_API_URL } from "../consts.js";
import { z } from "zod";

export function registerGetPlantsTools(server: McpServer) {
  server.registerTool(
    "get-plants",
    {
      title: "Get Plant Products",
      annotations: {
        description: "Get a list of plant products from Empower Plant store",
      },
      inputSchema: {
        title: z
          .string()
          .optional()
          .describe(
            "Partial title of the plant to get care guide for, matches any part of the title, case insensitive"
          ),
      },
    },
    async ({ title }) => {
      try {
        const plants = await fetchPlantProducts(title);
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

async function fetchPlantProducts(
  search?: string
): Promise<PlantProductSummary[]> {
  const response = await fetch(`${EMPOWER_PLANT_API_URL}/products`);

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const products: PlantProduct[] = await response.json();

  const summaries: PlantProductSummary[] = products
    .filter((product) =>
      search ? product.title.toLowerCase().includes(search.toLowerCase()) : true
    )
    .map((product) => ({
      id: product.id,
      title: product.title,
      description: product.description,
      price: product.price,
    }));

  return summaries;
}
