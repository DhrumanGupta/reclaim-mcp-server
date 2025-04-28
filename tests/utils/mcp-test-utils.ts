/**
 * @fileoverview Utilities for setting up and interacting with the MCP server during integration tests.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

import { initializeServer } from "../../src/index.js"; // Use the main server initializer
import type { ReclaimApiClient } from "../../src/types/reclaim.js"; // Import API client type

// Removed imports for registerTaskActionTools and registerTaskCrudTools as they no longer exist

/**
 * Sets up a test environment with a server instance and a connected client.
 * Allows injecting a mock API client for testing tool handlers.
 *
 * @param mockApiClient - A mock implementation of the ReclaimApiClient for testing.
 * @returns An object containing the initialized server, client, and transport.
 */
export async function setupTestEnvironment(mockApiClient: ReclaimApiClient) {
  // Initialize the server using the main entry point, injecting the mock client
  const server = initializeServer({
    isTestMode: true, // Indicate test mode
    apiClient: mockApiClient, // Inject the mock API client
  });

  // For testing, we need to provide the server parameters
  // Convert process.env to Record<string, string> by removing undefined values
  const env: Record<string, string> = {};
  Object.entries(process.env).forEach(([key, value]) => {
    if (value !== undefined) {
      env[key] = value;
    }
  });

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/index.js"],
    env,
  });

  // Start the transport
  await transport.start();

  // Connect server to transport
  await server.connect(transport);

  // Create client with server info
  const client = new Client({
    name: "reclaim-mcp-test-client",
    version: "1.0.0",
  });

  // Connect client with transport info
  await client.connect(transport);

  return { server, client, transport };
}

/**
 * Cleans up the test environment by disconnecting the client and server.
 *
 * @param client - The test client instance.
 * @param server - The test server instance.
 * @param transport - The test transport instance.
 */
export async function cleanupTestEnvironment(
  client: Client,
  // server: Server, // Server doesn't have an explicit disconnect in this setup
  transport: StdioClientTransport,
) {
  // client.disconnect() is no longer available
  // transport handles closing the connection streams implicitly or upon test process exit
  // No explicit server.disconnect() needed for stdio transport typically
}
