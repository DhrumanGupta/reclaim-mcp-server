/**
 * @fileoverview Main entry point for the Reclaim.ai MCP Server.
 * Initializes the server, registers tools and resources, and connects the transport.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// We don't need ListToolsRequestSchema if we aren't handling it manually
// import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/schema.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
// No need for zod-to-json-schema anymore
// import { zodToJsonSchema } from "zod-to-json-schema";
// No need for z here if not converting schemas
// import { z } from "zod";
import "dotenv/config"; // Load environment variables from .env file

import { logger } from "./logger.js";
import { registerTaskResources } from "./resources/tasks.js";
// Import functions that register tools AND handlers using server.tool
import { registerTaskActionTools } from "./tools/taskActions.js";
import { registerTaskCrudTools } from "./tools/taskCrud.js";
// No longer importing centralized definitions
// import { toolDefinitions } from "./tools/definitions.js";

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
 * Initializes the Reclaim MCP Server with the provided configuration.
 * - Sets up server info.
 * - Registers tool handlers and attempts to register metadata via server.tool.
 * - Registers resources.
 * - Returns the server instance but does not connect it to a transport.
 *
 * @param config - Optional configuration for server initialization
 * @returns The initialized server instance
 */
export function initializeServer(config: ServerConfig = {}): McpServer {
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

  const server = new McpServer(serverInfo);
  logger.error(`Server instance created for "${serverInfo.name}".`);

  // 1. Register Tools (including handlers) directly
  logger.error("Registering MCP tools and handlers...");
  try {
    // Pass the actual API client instance to the registration functions
    registerTaskActionTools(server, apiClient);
    registerTaskCrudTools(server, apiClient);
    logger.error("Tools and handlers registered successfully.");
  } catch (registrationError) {
    logger.error("ERROR during tool registration:", registrationError);
    if (!isTestMode) {
      process.exit(1);
    }
    throw registrationError;
  }

  // 2. Register Resources
  logger.error("Registering MCP resources...");
  registerTaskResources(server, apiClient); // Pass the API client here too
  logger.error("Resources registered successfully.");

  // 3. REMOVED Manual listTools handler - rely on server.tool (even if description is flawed)
  // logger.error("Registering listTools request handler...");
  // server.setRequestHandler(ListToolsRequestSchema, ...)
  // logger.error("listTools request handler registered.");

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
