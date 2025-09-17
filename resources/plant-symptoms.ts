import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

function getAllSymptoms() {
  return {
    availableSymptoms: [
      {
        key: "yellow-leaves",
        name: "Yellow Leaves",
        description: "Leaves turning yellow, common issue with multiple causes",
      },
      {
        key: "brown-spots",
        name: "Brown Spots",
        description: "Dark spots appearing on leaf surfaces",
      },
      {
        key: "wilting",
        name: "Wilting/Drooping",
        description: "Leaves becoming limp and drooping down",
      },
      {
        key: "brown-tips",
        name: "Brown Leaf Tips",
        description: "Tips of leaves turning brown and crispy",
      },
    ],
    usage:
      "Use plant://problems/{symptom} to get detailed diagnostic information",
    examples: [
      "plant://problems/yellow-leaves",
      "plant://problems/brown-spots",
      "plant://problems/wilting",
      "plant://problems/brown-tips",
    ],
  };
}

export const plantSymptomsResource = {
  template: new ResourceTemplate("plant://problems", { list: undefined }),
  metadata: {
    title: "Plant Problem Directory",
    description:
      "Directory of all available plant problem diagnostics and symptoms",
    annotations: {
      audience: ["user", "assistant"],
      priority: 0.6,
    },
  },
  handler: async (uri: any) => {
    const symptomsData = getAllSymptoms();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(symptomsData, null, 2),
        },
      ],
    };
  },
};
