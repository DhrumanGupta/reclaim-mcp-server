/**
 * @fileoverview Registers MCP Tools related to specific actions on Reclaim.ai tasks
 * (e.g., mark complete, delete, add time, prioritize, list tasks).
 */

import { z } from "zod";

import * as defaultApi from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js"; // Import the centralized helper

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Define type for the API client to support dependency injection
type ReclaimApiClient = {
  listTasks: typeof defaultApi.listTasks;
  getTask: typeof defaultApi.getTask;
  markTaskComplete: typeof defaultApi.markTaskComplete;
  markTaskIncomplete: typeof defaultApi.markTaskIncomplete;
  deleteTask: typeof defaultApi.deleteTask;
  addTimeToTask: typeof defaultApi.addTimeToTask;
  startTaskTimer: typeof defaultApi.startTaskTimer;
  stopTaskTimer: typeof defaultApi.stopTaskTimer;
  logWorkForTask: typeof defaultApi.logWorkForTask;
  clearTaskExceptions: typeof defaultApi.clearTaskExceptions;
  prioritizeTask: typeof defaultApi.prioritizeTask;
  filterActiveTasks: typeof defaultApi.filterActiveTasks;
};

/**
 * Registers all task action-related tools with the provided MCP Server instance.
 * Each tool corresponds to a specific Reclaim API endpoint for task manipulation or querying.
 * Uses the (name, schema, handler) signature for server.tool.
 *
 * @param server - The McpServer instance to register tools against.
 * @param apiClient - Optional API client for dependency injection (used in testing)
 */
export function registerTaskActionTools(
  server: McpServer,
  apiClient: ReclaimApiClient = defaultApi,
): void {
  // --- Common Schemas ---
  const taskIdSchema = z.number().int().positive("Task ID must be a positive integer.");
  const statusNote =
    "IMPORTANT NOTE: Tasks with 'status: COMPLETE' were NOT marked complete by the user. This means the user finished the initial block of time allocated to the task but did NOT finish the task. If asked to list all tasks or all active tasks, include each 'COMPLETE' task unless the user requests otherwise. Do NOT skip 'COMPLETE' tasks.";
  const getTaskStatusNote =
    "Note: If 'status' is 'COMPLETE', this means the task is NOT marked completed by the user. ARCHIVED or CANCELLED is used for completed tasks. A 'COMPLETE' task is still 'active'.";

  // --- Tool Definitions ---

  // List tasks tool (Ported from return_tasks flag in prior JS implementation)
  server.tool(
    "reclaim_list_tasks",
    // Zod schema for parameters
    {
      filter: z
        .enum(["active", "all"])
        .optional()
        .default("active")
        .describe(
          'Filter tasks: "active" (default) includes non-deleted tasks whose status is not ARCHIVED or CANCELLED; "all" includes all tasks.',
        ),
    },
    // Async handler function
    async ({ filter }) => {
      const allTasksPromise = apiClient.listTasks();

      // Conditionally apply filter based on input
      const processedTasksPromise = allTasksPromise.then((tasks) => {
        if (filter === "active") {
          return apiClient.filterActiveTasks(tasks);
        }
        // filter === 'all'
        return tasks;
      });

      // Wrap the API call and add the explanatory note to the output content
      const result = await wrapApiCall(processedTasksPromise);
      if (!result.isError && result.content) {
        result.content.push({
          type: "text",
          text: statusNote,
        });
      }
      return result;
    },
    // .annotations({ description: "Lists Reclaim.ai tasks, optionally filtering for active ones (not deleted, ARCHIVED, or CANCELLED)." })
  );

  // Get specific task tool
  server.tool(
    "reclaim_get_task",
    // Zod schema for parameters
    { taskId: taskIdSchema.describe("The unique ID of the task to fetch.") },
    // Async handler function using wrapApiCall
    async ({ taskId }) => {
      // Wrap the API call and add the explanatory note to the output content
      const result = await wrapApiCall(apiClient.getTask(taskId));
      if (!result.isError && result.content) {
        result.content.push({
          type: "text",
          text: getTaskStatusNote,
        });
      }
      return result;
    },
    // .annotations({ description: "Fetch details for a specific Reclaim.ai task by its ID." })
  );

  // Mark task complete tool
  server.tool(
    "reclaim_mark_complete",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to mark as complete."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.markTaskComplete(taskId)),
    // .annotations({ description: "Mark a specific Reclaim.ai task as completed/done by the user." })
  );

  // Mark task incomplete tool
  server.tool(
    "reclaim_mark_incomplete",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to mark as incomplete (unarchive)."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.markTaskIncomplete(taskId)),
    // .annotations({ description: "Mark a specific Reclaim.ai task as incomplete (e.g., unarchive it)." })
  );

  // Delete task tool
  server.tool(
    "reclaim_delete_task",
    { taskId: taskIdSchema.describe("The unique ID of the task to delete.") },
    async ({ taskId }) => wrapApiCall(apiClient.deleteTask(taskId)),
    // Consider adding destructiveHint=true via annotations if needed by clients
    // .annotations({ description: "Permanently delete a specific Reclaim.ai task.", destructiveHint: true });
  );

  // Add time to task tool
  server.tool(
    "reclaim_add_time",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to add time to."),
      minutes: z
        .number()
        .int()
        .positive("Minutes must be a positive integer.")
        .describe("Number of minutes to add to the task schedule."),
    },
    async ({ taskId, minutes }) => wrapApiCall(apiClient.addTimeToTask(taskId, minutes)),
    // .annotations({ description: "Add scheduled time (in minutes) to a specific Reclaim.ai task." })
  );

  // Start task timer tool
  server.tool(
    "reclaim_start_timer",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to start the timer for."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.startTaskTimer(taskId)),
    // .annotations({ description: "Start the live timer for a specific Reclaim.ai task." })
  );

  // Stop task timer tool
  server.tool(
    "reclaim_stop_timer",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to stop the timer for."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.stopTaskTimer(taskId)),
    // .annotations({ description: "Stop the live timer for a specific Reclaim.ai task." })
  );

  // Log work for task tool
  server.tool(
    "reclaim_log_work",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to log work against."),
      minutes: z
        .number()
        .int()
        .positive("Minutes must be a positive integer.")
        .describe("Number of minutes worked."),
      // Schema accepts ISO datetime string or YYYY-MM-DD date string
      end: z
        .union([
          z.string().datetime({
            message: "End time must be a valid ISO 8601 date/time string.",
          }),
          z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
            message: "End date must be in YYYY-MM-DD format.",
          }),
        ])
        .optional()
        .describe(
          "Optional end time/date of the work log (ISO 8601 or YYYY-MM-DD). Defaults to now.",
        ),
    },
    async ({ taskId, minutes, end }) => wrapApiCall(apiClient.logWorkForTask(taskId, minutes, end)),
    // .annotations({ description: "Log completed work time (in minutes) against a specific Reclaim.ai task." })
  );

  // Clear task exceptions tool
  server.tool(
    "reclaim_clear_exceptions",
    {
      taskId: taskIdSchema.describe(
        "The unique ID of the task whose scheduling exceptions should be cleared.",
      ),
    },
    async ({ taskId }) => wrapApiCall(apiClient.clearTaskExceptions(taskId)),
    // .annotations({ description: "Clear any scheduling exceptions for a specific Reclaim.ai task." })
  );

  // Prioritize task tool
  server.tool(
    "reclaim_prioritize",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to prioritize."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.prioritizeTask(taskId)),
    // .annotations({ description: "Mark a specific Reclaim.ai task for prioritization in the schedule." })
  );
}
