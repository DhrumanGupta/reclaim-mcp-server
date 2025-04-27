/**
 * @fileoverview Registers MCP Resources related to fetching Reclaim.ai task data.
 * Currently includes a resource for listing active tasks.
 */

import { logger } from "../logger.js"; // Import the logger utility
import * as defaultApi from "../reclaim-client.js";
import { ReclaimError } from "../types/reclaim.js"; // Ensure .js extension if needed by module system

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Import specific result and content types from the SDK
import type { ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";

// Define type for the API client to support dependency injection
type ReclaimApiClient = {
  listTasks: typeof defaultApi.listTasks;
  filterActiveTasks: typeof defaultApi.filterActiveTasks;
};

/**
 * Wraps an API call promise specifically for MCP Resource handlers.
 * Formats the successful result into a properly structured resource result (ReadResourceResult).
 *
 * @param uri - The canonical URI string for the resource being accessed.
 * @param promise - The promise returned by the `reclaim-client` function fetching resource data.
 * @returns A Promise resolving to the SDK's `ReadResourceResult`.
 * @throws {Error} Throws a descriptive error if the underlying API call fails, to be handled by the MCP framework.
 */
async function wrapResourceCall(
  uri: string,
  promise: Promise<unknown>,
): Promise<ReadResourceResult> {
  try {
    const result = await promise;
    // Resources typically return structured data; stringify for the text content.
    const jsonText = JSON.stringify(result, null, 2); // Pretty-print JSON

    // Construct the ResourceContents array matching the SDK's expected structure
    const contents = [
      {
        uri: uri,
        mimeType: "application/json", // Specify the mime type
        text: jsonText, // Provide the content as text
        // Use 'blob' property instead of 'text' for binary data
      },
    ];

    // Return structure matches SDK examples: { contents: Array }
    return {
      contents: contents,
    };
  } catch (e: unknown) {
    // Catch variable is 'unknown'
    // Normalize the error message
    let errorMessage = "Failed to fetch resource data.";
    let errorDetail: string | undefined;

    // Use type guards to safely access properties
    if (e instanceof ReclaimError) {
      errorMessage = e.message; // Use formatted message from client
      // Safely stringify detail if it exists
      errorDetail = e.detail ? JSON.stringify(e.detail) : undefined;
    } else if (e instanceof Error) {
      errorMessage = e.message; // Standard Error message
    } else {
      errorMessage = String(e); // Fallback for non-Error types
    }

    // Log the detailed error server-side
    logger.error(
      `MCP Resource Error (URI: ${uri}): ${errorMessage}`,
      errorDetail ? `\nDetail: ${errorDetail}` : "",
    );

    // Throw a new error to be handled by the MCP server framework for resource failures.
    // The framework should convert this into an appropriate JSON-RPC error response.
    throw new Error(`Failed to fetch resource ${uri}: ${errorMessage}`);
  }
}

/**
 * Registers all task-related resources with the provided MCP Server instance.
 * Currently registers the 'tasks://active' resource.
 *
 * @param server - The McpServer instance to register resources against.
 * @param apiClient - Optional API client for dependency injection (used in testing)
 */
export function registerTaskResources(
  server: McpServer,
  apiClient: ReclaimApiClient = defaultApi,
): void {
  // Register a static resource for active tasks.
  // The signature requires (name, uriTemplate, [metadata], handler)
  server.resource(
    "reclaim_active_tasks", // Internal name for the resource registration
    "tasks://active", // The static URI string for this resource
    {
      // Optional metadata object
      title: "Active Reclaim Tasks",
      description:
        "List of all active tasks from Reclaim.ai. Active means tasks that are not deleted and whose status is not ARCHIVED or CANCELLED. Tasks with status 'COMPLETE' (meaning scheduled time is finished) are included here.",
      readOnlyHint: true,
    },
    // Handler function: (uri: URL, params: Record<string, string | string[]>, extra) => Promise<ReadResourceResult>
    // For static URIs, params will be empty.
    async (uri) => {
      // Fetch all tasks, then filter for active ones using the client's filter function
      const activeTasksPromise = apiClient
        .listTasks()
        .then((allTasks) => apiClient.filterActiveTasks(allTasks));

      // Use the wrapper to format the result correctly for the SDK
      // Pass uri.href which is the string representation of the URL
      return wrapResourceCall(uri.href, activeTasksPromise);
    },
  );
}
