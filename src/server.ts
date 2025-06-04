import { server } from "./index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"

/**
 * Start the MCP server with stdio transport
 */
async function startServer() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error("WhatsApp Flows MCP Server running on stdio")
}

// Start the server
startServer().catch((error) => {
  console.error("Server error:", error)
  process.exit(1)
})