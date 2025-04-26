/**
 * @fileoverview Utility functions for the Reclaim MCP server.
 */

// Import necessary types from the SDK and local types
import { ReclaimError } from "./types/reclaim.js"; // Fixed import path with .js extension

import type { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";

/**
 * Wraps an API call promise, formatting the result or error into an MCP ToolResult structure.
 * Provides detailed error messages for better debugging and client feedback.
 * Handles successful void promises by returning a standard success object.
 *
 * @param promise - The promise returned by a `reclaim-client` API function.
 * @returns A Promise resolving to the SDK's `CallToolResult`.
 */
export async function wrapApiCall(promise: Promise<unknown>): Promise<CallToolResult> {
  try {
    const result = await promise;

    let contentParts: TextContent[]; // Explicitly type as TextContent array

    // Handle successful void promises (e.g., from deleteTask)
    if (result === undefined) {
      contentParts = [{ type: "text", text: JSON.stringify({ success: true }, null, 2) }];
    } else {
      // Attempt to stringify complex objects, otherwise return simple types as string
      const resultText =
        typeof result === "object" && result !== null
          ? JSON.stringify(result, null, 2) // Pretty-print JSON results
          : String(result);

      // Always return as 'text' content type for simplicity, as the SDK expects specific types.
      // If the SDK had an 'application/json' type, we could use that conditionally.
      contentParts = [{ type: "text", text: resultText }];
    }

    return {
      content: contentParts,
    };
  } catch (e: unknown) {
    // Catch variable is 'unknown'
    // Default error details
    let errorMessage = "An unknown error occurred.";
    let errorDetail: any = undefined;
    let errorCode: number | undefined = undefined;

    // Use type guards to safely access properties
    if (e instanceof ReclaimError) {
      errorMessage = e.message; // Use the formatted message from the client
      errorDetail = e.detail;
      errorCode = e.status;
    } else if (e instanceof Error) {
      errorMessage = e.message;
      errorDetail = { stack: e.stack }; // Include stack for general errors
    } else {
      // Handle non-Error throws (e.g., throwing a string or object)
      errorMessage = `An unexpected non-Error value was thrown: ${String(e)}`;
      errorDetail = e; // Preserve the original thrown value
    }

    // Log the detailed error server-side for debugging - CHANGED TO CONSOLE.ERROR
    console.error(`MCP Tool Error: ${errorMessage}`, {
      code: errorCode,
      detail: errorDetail,
    });

    // Construct a user-friendly error message for the ToolResult
    let userMessage = `Error: ${errorMessage}`;
    // Append status code if available
    if (errorCode) {
      userMessage = `Error ${errorCode}: ${errorMessage}`;
    }

    // Try to add more context from the detail if it's simple
    let detailString: string | undefined;
    if (errorDetail && typeof errorDetail === "object") {
      if (errorDetail.title && typeof errorDetail.title === "string")
        userMessage += ` - ${errorDetail.title}`;
      // Avoid overly verbose details; focus on actionable messages if possible
      if (
        errorDetail.detail &&
        typeof errorDetail.detail === "string" &&
        errorDetail.detail.length < 150
      ) {
        detailString = errorDetail.detail;
      } else if (
        errorDetail.message &&
        typeof errorDetail.message === "string" &&
        errorDetail.message !== errorMessage
      ) {
        // Sometimes detail has its own message property
        detailString = errorDetail.message;
      }
    } else if (typeof errorDetail === "string" && errorDetail.length < 150) {
      // Include simple string details if they aren't the main message
      if (errorDetail !== errorMessage) {
        detailString = errorDetail;
      }
    }

    if (detailString) {
      userMessage += ` (${detailString})`;
    }

    // Return the error structure for MCP, using TextContent
    return {
      isError: true,
      content: [{ type: "text", text: userMessage }],
      // Future enhancement: Could include structured error data if MCP spec evolves
      // _meta: { errorData: { code: errorCode, message: errorMessage, detail: errorDetail } }
    };
  }
}
