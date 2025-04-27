/**
 * @fileoverview Utility functions for testing the MCP protocol layer
 * Provides helper methods to set up an MCP server and client for testing
 */

// TODO: Fix the imports from the ModelContextProtocol SDK
// The current imports cause TypeScript errors due to path resolution issues
// For now, we'll use type declarations and dynamic imports to avoid compilation errors

import { testLogger } from "./logger.js";
import { createReclaimApiMock } from "./reclaim-api-mock.js";
import { registerTaskActionTools } from "../../src/tools/taskActions.js";
import { registerTaskCrudTools } from "../../src/tools/taskCrud.js";
import { registerTaskResources } from "../../src/resources/tasks.js";

// Type declarations to match the SDK interfaces we need
declare class McpServer {
  constructor(info: ServerInfo);
  connect(transport: unknown): Promise<void>;
  tool(name: string, schema: unknown, handler: Function): void;
  resource(uri: string, handler: Function): void;
}

declare class McpClient {
  connect(transport: unknown): Promise<void>;
  callTool(name: string, params: Record<string, unknown>): Promise<CallToolResult>;
  readResource(uri: string): Promise<ResourceResult>;
}

declare class MemoryTransport {
  serverTransport: unknown;
  clientTransport: unknown;
}

interface ServerInfo {
  name: string;
  version: string;
  publisher: string;
  description: string;
  homepage?: string;
  supportUrl?: string;
}

interface CallToolResult {
  error?: string;
  value?: unknown;
}

interface ResourceResult {
  contents: Array<{ text: string }>;
}

/**
 * Due to issues with the SDK imports, we're temporarily disabling the MCP protocol testing
 * functionality. This function will throw an error with a meaningful message when called.
 *
 * This will be fixed in a future update to properly test the MCP protocol layer.
 *
 * @param testName - The name of the test for logging purposes
 * @param mockApi - Optional mock API client to inject (defaults to creating a new mock)
 * @throws Error indicating that MCP protocol testing is not currently available
 */
export async function setupMcpServerAndClient(
  testName: string,
  mockApi?: ReturnType<typeof createReclaimApiMock>,
) {
  testLogger.step(testName, "MCP protocol testing is not currently available");
  throw new Error(
    "MCP protocol testing is not currently available due to SDK import issues. " +
      "Tests need to be updated to properly import from @modelcontextprotocol/sdk. " +
      "For now, please use the API client mocks directly instead of the MCP protocol layer.",
  );
}

/**
 * Helper function to call an MCP tool and handle errors
 * Currently disabled due to SDK import issues.
 *
 * @param client - The MCP client instance
 * @param toolName - The name of the tool to call
 * @param params - The parameters to pass to the tool
 * @param testName - The name of the test for logging
 * @throws Error indicating that MCP protocol testing is not currently available
 */
export async function callMcpTool(
  client: any,
  toolName: string,
  params: Record<string, unknown>,
  testName: string,
): Promise<CallToolResult> {
  testLogger.step(testName, `MCP protocol testing is not currently available`);
  throw new Error(
    "MCP protocol testing is not currently available due to SDK import issues. " +
      "Tests need to be updated to properly import from @modelcontextprotocol/sdk.",
  );
}

/**
 * Helper function to read an MCP resource and handle errors
 * Currently disabled due to SDK import issues.
 *
 * @param client - The MCP client instance
 * @param resourceUri - The URI of the resource to read
 * @param testName - The name of the test for logging
 * @throws Error indicating that MCP protocol testing is not currently available
 */
export async function readMcpResource(
  client: any,
  resourceUri: string,
  testName: string,
): Promise<string> {
  testLogger.step(testName, `MCP protocol testing is not currently available`);
  throw new Error(
    "MCP protocol testing is not currently available due to SDK import issues. " +
      "Tests need to be updated to properly import from @modelcontextprotocol/sdk.",
  );
}
