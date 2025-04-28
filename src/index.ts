/**
 * @fileoverview Main entry point for the Reclaim.ai MCP Server.
 * Initializes the server, registers tools and resources, and connects the transport.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import "dotenv/config"; // Load environment variables from .env file

import { logger } from "./logger.js";
import { registerTaskResources } from "./resources/tasks.js";
import { registerExampleTool } from "./tools/example-tool.js";
import { registerTaskActionTools } from "./tools/taskActions.js";
import { registerTaskCrudTools } from "./tools/taskCrud.js";

// --- Server Information ---
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
type PackageJson = {
  name?: string;
  version?: string;
  author?: string;
  homepage?: string;
  bugs?: { url?: string };
  description?: string;
};
let pkg: PackageJson = {};
try {
  pkg = require("../package.json");
} catch (e) {
  logger.error("Could not read package.json, using default server info.", e);
  pkg = {};
}

const serverInfo = {
  name: pkg.name || "reclaim-mcp-server",
  version: pkg.version || "0.0.0",
  publisher: pkg.author || "Unknown Publisher",
  homepage: pkg.homepage || undefined,
  supportUrl: pkg.bugs?.url || undefined,
  description: pkg.description || "MCP Server for Reclaim.ai Tasks",
};

import * as defaultApi from "./reclaim-client.js"; // Import the actual API client implementation
// --- Server Configuration & Initialization ---
import type { ReclaimApiClient } from "./types/reclaim.js";

export interface ServerConfig {
  isTestMode?: boolean;
  apiKey?: string;
  // Allow injecting API client for tests OR use default
  apiClient?: ReclaimApiClient;
}

/**
 * Logs SDK version information for debugging.
 */
function logSdkVersion(): void {
  try {
    const sdkPackage = require("@modelcontextprotocol/sdk/package.json");
    logger.error(`MCP SDK version: ${sdkPackage.version}`);
  } catch (e) {
    logger.error("Could not determine MCP SDK version", e);
  }
}

/**
 * Registers all MCP tools with the provided server.
 *
 * @param server - The server instance to register tools with
 * @param apiClient - The API client to use for tool handlers
 * @param isTestMode - Whether the server is running in test mode
 */
function registerServerTools(
  server: Server,
  apiClient: ReclaimApiClient,
  isTestMode: boolean,
): void {
  try {
    // Register example tool first (to test schema formatting)
    logger.error("Registering example tool...");
    registerExampleTool(server as unknown as McpServer);

    // Register task-related tools
    logger.error("Registering MCP tools and handlers...");
    registerTaskActionTools(server as unknown as McpServer, apiClient);
    registerTaskCrudTools(server as unknown as McpServer, apiClient);

    // Debug logging to see what tools were registered
    // @ts-ignore - Access private property for debugging
    const toolsMap = server._tools;
    if (toolsMap) {
      logger.error(`Registered tools: ${Array.from(toolsMap.keys()).join(", ")}`);
      // Log the example tool definition to see the format
      const exampleTool = toolsMap.get("calculate_sum");
      if (exampleTool) {
        logger.error(`Example tool definition: ${JSON.stringify(exampleTool, null, 2)}`);
      }

      // Log a sample tool definition to see the format
      const sampleTool = toolsMap.get(Array.from(toolsMap.keys())[0]);
      if (sampleTool) {
        logger.error(`Sample tool definition: ${JSON.stringify(sampleTool, null, 2)}`);
      }
    } else {
      logger.error("Could not access tools map for debugging");
    }

    logger.error("Tools and handlers registered successfully.");
  } catch (registrationError) {
    logger.error("ERROR during tool registration:", registrationError);
    if (!isTestMode) {
      // Exit if not in test mode
      process.exit(1);
    }
  }
}

/**
 * Initializes the Reclaim MCP Server with the provided configuration.
 * - Sets up server info.
 * - Registers tool handlers and attempts to register metadata via server.tool.
 * - Registers resources.
 * - Returns the server instance but does not connect it to a transport.
 *
 * @param config - Optional configuration for server initialization
 * @returns The initialized server instance
 */
export function initializeServer(config: ServerConfig = {}): Server {
  const { isTestMode = false, apiKey = process.env.RECLAIM_API_KEY } = config;
  // Use injected apiClient if provided (for tests), otherwise use the default import
  const apiClient = config.apiClient || defaultApi;

  if (!apiKey && !isTestMode) {
    logger.error("FATAL ERROR: RECLAIM_API_KEY environment variable is not set.");
    process.exit(1);
  } else if (apiKey) {
    logger.error("Reclaim API Token found in environment variables.");
  } else {
    logger.error("Running in test mode with no API key or mock client.");
  }

  const server = new Server(serverInfo);
  logger.error(`Server instance created for "${serverInfo.name}".`);

  // Log SDK version for debugging
  logSdkVersion();

  // Register all tools with the server
  registerServerTools(server, apiClient, isTestMode);

  return server;
}

/**
 * Main function to initialize and start the server with Stdio transport.
 */
async function main(): Promise<void> {
  logger.error(`Initializing ${serverInfo.name} v${serverInfo.version}...`);
  const server = initializeServer(); // Uses default API client

  logger.error("Attempting to connect via StdioServerTransport...");
  const transport = new StdioServerTransport();

  try {
    await server.connect(transport);
    logger.error(
      `✅ ${serverInfo.name} is running and connected via stdio. Listening for MCP messages on stdin...`,
    );
  } catch (connectionError) {
    logger.error("FATAL ERROR: Failed to connect MCP server to stdio transport:", connectionError);
    process.exit(1);
  }
}

// --- Global Error Handling & Execution ---
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
});

// Execute main only if running as script
// biome-ignore lint/suspicious/noExplicitAny: Need to compare meta URL type
if ((import.meta as any).url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("FATAL ERROR during server startup sequence:", error);
    process.exit(1);
  });
}
