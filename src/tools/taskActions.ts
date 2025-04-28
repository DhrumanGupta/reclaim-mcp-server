/**
 * @fileoverview Registers MCP Tools related to specific actions on Reclaim.ai tasks
 * (e.g., mark complete, delete, add time, prioritize, list tasks).
 */

import { z } from "zod";

import * as defaultApi from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js"; // Import the centralized helper

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ZodRawShape } from "zod"; // Import ZodRawShape type

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
 * Uses the (name, description, rawShape, handler) signature based on TS errors and analysis.
 *
 * @param server - The McpServer instance to register tools against.
 * @param apiClient - Optional API client for dependency injection (used in testing)
 */
export function registerTaskActionTools(
  server: McpServer,
  apiClient: ReclaimApiClient = defaultApi,
): void {
  // --- Common Zod Types ---
  const taskIdNumberSchema = z.number().int().positive("Task ID must be a positive integer.");

  // --- Common Notes ---
  const statusNote =
    "IMPORTANT NOTE ON 'COMPLETE' STATUS: In Reclaim.ai, tasks marked 'COMPLETE' mean their *scheduled time block* finished, but the user did NOT necessarily finish the work or mark it done. Treat 'COMPLETE' tasks as ACTIVE and PENDING unless they are also ARCHIVED or CANCELLED. If asked for 'active' or 'open' tasks, YOU MUST INCLUDE tasks with status 'COMPLETE'.";
  const getTimeStatusNote =
    "Note on 'status': If 'COMPLETE', the scheduled time block ended, but the user has NOT marked the task done. It is still considered active/pending.";

  // --- Tool Definitions ---

  // List tasks tool
  const listTasksShape: ZodRawShape = {
    filter: z
      .enum(["active", "all"])
      .optional()
      .default("active")
      // Add .describe() here for FIELD description if needed by client/SDK
      .describe(
        'Filter tasks: "active" (default) excludes ARCHIVED/CANCELLED/deleted; "all" includes all.',
      ),
  };
  server.tool(
    "reclaim_list_tasks",
    `Lists Reclaim.ai tasks. Default filter is "active". ${statusNote}`, // Description (2nd arg)
    listTasksShape, // Raw Shape (3rd arg)
    async ({ filter }) => {
      // Type 'filter' should be inferred
      const allTasksPromise = apiClient.listTasks();
      const processedTasksPromise = allTasksPromise.then((tasks) => {
        if (filter === "active") {
          return apiClient.filterActiveTasks(tasks);
        }
        return tasks;
      });

      const result = await wrapApiCall(processedTasksPromise);
      if (!result.isError && result.content) {
        result.content.push({ type: "text", text: statusNote });
      }
      return result;
    },
  );

  // Get specific task tool
  const getTaskShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to fetch."), // Field description
  };
  server.tool(
    "reclaim_get_task",
    `Retrieves details for a specific Reclaim.ai task by its ID. ${getTimeStatusNote}`, // Description (2nd arg)
    getTaskShape, // Raw Shape (3rd arg)
    async ({ taskId }) => {
      // Type 'taskId' should be inferred
      const result = await wrapApiCall(apiClient.getTask(taskId));
      if (!result.isError && result.content) {
        result.content.push({ type: "text", text: getTimeStatusNote });
      }
      return result;
    },
  );

  // Mark task complete tool
  const markCompleteShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to mark as complete."), // Field description
  };
  server.tool(
    "reclaim_mark_complete",
    "Marks a specific Reclaim.ai task as completed/done by the user. This usually archives the task.", // Description (2nd arg)
    markCompleteShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.markTaskComplete(taskId)), // Type 'taskId' inferred
  );

  // Mark task incomplete tool
  const markIncompleteShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe(
      "The unique ID of the task to mark as incomplete (unarchive).",
    ), // Field description
  };
  server.tool(
    "reclaim_mark_incomplete",
    "Marks a specific Reclaim.ai task as incomplete (e.g., unarchives it, moves it back to the planner).", // Description (2nd arg)
    markIncompleteShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.markTaskIncomplete(taskId)), // Type 'taskId' inferred
  );

  // Delete task tool
  const deleteTaskShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to delete."), // Field description
  };
  server.tool(
    "reclaim_delete_task",
    "Permanently delete a specific Reclaim.ai task. This action cannot be undone easily.", // Description (2nd arg)
    deleteTaskShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.deleteTask(taskId)), // Type 'taskId' inferred
  );

  // Add time to task tool
  const addTimeShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to add time to."), // Field description
    minutes: z
      .number()
      .int()
      .positive("Minutes must be a positive integer.")
      .describe("Number of minutes to add to the task schedule."), // Field description
  };
  server.tool(
    "reclaim_add_time",
    "Adds scheduled time (in minutes) to a specific Reclaim.ai task. This blocks more time on the user's calendar. Use this if a task needs more time than allocated (e.g., timeChunksRemaining is 0 but work remains) or if a task has status 'COMPLETE' but the user indicates it's not finished.", // Description (2nd arg)
    addTimeShape, // Raw Shape (3rd arg)
    async ({ taskId, minutes }) => wrapApiCall(apiClient.addTimeToTask(taskId, minutes)), // Types inferred
  );

  // Start task timer tool
  const startTimerShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to start the timer for."), // Field description
  };
  server.tool(
    "reclaim_start_timer",
    "Starts the live timer for a specific Reclaim.ai task. This indicates the user is actively working on it now and helps log time accurately.", // Description (2nd arg)
    startTimerShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.startTaskTimer(taskId)), // Type 'taskId' inferred
  );

  // Stop task timer tool
  const stopTimerShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to stop the timer for."), // Field description
  };
  server.tool(
    "reclaim_stop_timer",
    "Stops the live timer for a specific Reclaim.ai task. Time tracked is automatically logged.", // Description (2nd arg)
    stopTimerShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.stopTaskTimer(taskId)), // Type 'taskId' inferred
  );

  // Log work for task tool
  const logWorkShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to log work against."), // Field description
    minutes: z
      .number()
      .int()
      .positive("Minutes must be a positive integer.")
      .describe("Number of minutes worked."), // Field description
    end: z
      .union([
        z.string().datetime({ message: "End time must be a valid ISO 8601 date/time string." }),
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "End date must be in YYYY-MM-DD format." }),
      ])
      .optional()
      .describe(
        "Optional end time/date of the work log (ISO 8601 or YYYY-MM-DD). Defaults to now.",
      ), // Field description
  };
  server.tool(
    "reclaim_log_work",
    "Logs completed work time (in minutes) against a specific Reclaim.ai task. This reduces the remaining time needed and affects future scheduling.", // Description (2nd arg)
    logWorkShape, // Raw Shape (3rd arg)
    async ({ taskId, minutes, end }) => wrapApiCall(apiClient.logWorkForTask(taskId, minutes, end)), // Types inferred
  );

  // Clear task exceptions tool
  const clearExceptionsShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe(
      "The unique ID of the task whose scheduling exceptions should be cleared.",
    ), // Field description
  };
  server.tool(
    "reclaim_clear_exceptions",
    "Clears any scheduling exceptions (e.g., manual adjustments, declines) for a specific Reclaim.ai task, allowing it to reschedule normally.", // Description (2nd arg)
    clearExceptionsShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.clearTaskExceptions(taskId)), // Type 'taskId' inferred
  );

  // Prioritize task tool
  const prioritizeShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to prioritize."), // Field description
  };
  server.tool(
    "reclaim_prioritize",
    "Marks a specific Reclaim.ai task for prioritization ('On Deck'), increasing its likelihood of being scheduled sooner.", // Description (2nd arg)
    prioritizeShape, // Raw Shape (3rd arg)
    async ({ taskId }) => wrapApiCall(apiClient.prioritizeTask(taskId)), // Type 'taskId' inferred
  );
}
