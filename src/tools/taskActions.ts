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
    "IMPORTANT NOTE ON 'COMPLETE' STATUS: In Reclaim.ai, tasks marked 'COMPLETE' mean their *scheduled time block* finished, but the user did NOT necessarily finish the work or mark it done. Treat 'COMPLETE' tasks as ACTIVE and PENDING unless they are also ARCHIVED or CANCELLED. If asked for 'active' or 'open' tasks, YOU MUST INCLUDE tasks with status 'COMPLETE'.";
  const getTimeStatusNote =
    "Note on 'status': If 'COMPLETE', the scheduled time block ended, but the user has NOT marked the task done. It is still considered active/pending.";

  // --- Tool Definitions ---

  // List tasks tool (Ported from return_tasks flag in prior JS implementation)
  server.tool(
    "reclaim_list_tasks",
    // Description string as 2nd parameter
    `Lists Reclaim.ai tasks. Default filter is "active". ${statusNote}`,
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
  );

  // Get specific task tool
  server.tool(
    "reclaim_get_task",
    // Description string as 2nd parameter
    `Retrieves details for a specific Reclaim.ai task by its ID. ${getTimeStatusNote}`,
    // Zod schema for parameters
    { taskId: taskIdSchema.describe("The unique ID of the task to fetch.") },
    // Async handler function using wrapApiCall
    async ({ taskId }) => {
      // Wrap the API call and add the explanatory note to the output content
      const result = await wrapApiCall(apiClient.getTask(taskId));
      if (!result.isError && result.content) {
        result.content.push({
          type: "text",
          text: getTimeStatusNote,
        });
      }
      return result;
    },
  );

  // Mark task complete tool
  server.tool(
    "reclaim_mark_complete",
    "Marks a specific Reclaim.ai task as completed/done by the user. This usually archives the task.",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to mark as complete."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.markTaskComplete(taskId)),
  );

  // Mark task incomplete tool
  server.tool(
    "reclaim_mark_incomplete",
    "Marks a specific Reclaim.ai task as incomplete (e.g., unarchives it, moves it back to the planner).",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to mark as incomplete (unarchive)."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.markTaskIncomplete(taskId)),
  );

  // Delete task tool
  server.tool(
    "reclaim_delete_task",
    "Permanently delete a specific Reclaim.ai task. This action cannot be undone easily.",
    { taskId: taskIdSchema.describe("The unique ID of the task to delete.") },
    async ({ taskId }) => wrapApiCall(apiClient.deleteTask(taskId)),
  );

  // Add time to task tool
  server.tool(
    "reclaim_add_time",
    "Adds scheduled time (in minutes) to a specific Reclaim.ai task. This blocks more time on the user's calendar. Use this if a task needs more time than allocated (e.g., timeChunksRemaining is 0 but work remains) or if a task has status 'COMPLETE' but the user indicates it's not finished.",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to add time to."),
      minutes: z
        .number()
        .int()
        .positive("Minutes must be a positive integer.")
        .describe("Number of minutes to add to the task schedule."),
    },
    async ({ taskId, minutes }) => wrapApiCall(apiClient.addTimeToTask(taskId, minutes)),
  );

  // Start task timer tool
  server.tool(
    "reclaim_start_timer",
    "Starts the live timer for a specific Reclaim.ai task. This indicates the user is actively working on it now and helps log time accurately.",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to start the timer for."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.startTaskTimer(taskId)),
  );

  // Stop task timer tool
  server.tool(
    "reclaim_stop_timer",
    "Stops the live timer for a specific Reclaim.ai task. Time tracked is automatically logged.",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to stop the timer for."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.stopTaskTimer(taskId)),
  );

  // Log work for task tool
  server.tool(
    "reclaim_log_work",
    "Logs completed work time (in minutes) against a specific Reclaim.ai task. This reduces the remaining time needed and affects future scheduling.",
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
  );

  // Clear task exceptions tool
  server.tool(
    "reclaim_clear_exceptions",
    "Clears any scheduling exceptions (e.g., manual adjustments, declines) for a specific Reclaim.ai task, allowing it to reschedule normally.",
    {
      taskId: taskIdSchema.describe(
        "The unique ID of the task whose scheduling exceptions should be cleared.",
      ),
    },
    async ({ taskId }) => wrapApiCall(apiClient.clearTaskExceptions(taskId)),
  );

  // Prioritize task tool
  server.tool(
    "reclaim_prioritize",
    "Marks a specific Reclaim.ai task for prioritization ('On Deck'), increasing its likelihood of being scheduled sooner.",
    {
      taskId: taskIdSchema.describe("The unique ID of the task to prioritize."),
    },
    async ({ taskId }) => wrapApiCall(apiClient.prioritizeTask(taskId)),
  );
}
