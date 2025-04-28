/**
 * @fileoverview Registers MCP Tools related to specific actions on Reclaim.ai tasks
 * (e.g., mark complete, delete, add time, prioritize, list tasks).
 */

import { z } from "zod";
import type { ZodRawShape } from "zod"; // Import ZodRawShape type

import * as defaultApi from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js"; // Import the centralized helper

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReclaimApiClient } from "../types/reclaim.js"; // Import the full interface

/**
 * Registers all task action-related tools with the provided MCP Server instance.
 * Uses the (name, description, rawShape, handler) signature based on TS errors and analysis.
 * Handler parameter types are inferred using z.infer.
 *
 * @param server - The McpServer instance to register handlers against.
 * @param apiClient - Optional API client for dependency injection (used in testing).
 */
export function registerTaskActionTools(
  server: McpServer,
  apiClient: ReclaimApiClient = defaultApi, // Use the full client type
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
      .describe(
        'Filter tasks: "active" (default) excludes ARCHIVED/CANCELLED/deleted; "all" includes all.',
      ),
  };
  type ListTasksParams = z.infer<z.ZodObject<typeof listTasksShape>>;

  server.tool(
    "reclaim_list_tasks",
    `Lists Reclaim.ai tasks. Default filter is "active". ${statusNote}`, // Description (2nd arg)
    listTasksShape, // Raw Shape (3rd arg)
    async (params: ListTasksParams) => {
      // Use inferred type
      const { filter } = params;
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
    taskId: taskIdNumberSchema.describe("The unique ID of the task to fetch."),
  };
  type GetTaskParams = z.infer<z.ZodObject<typeof getTaskShape>>;

  server.tool(
    "reclaim_get_task",
    `Retrieves details for a specific Reclaim.ai task by its ID. ${getTimeStatusNote}`, // Description (2nd arg)
    getTaskShape, // Raw Shape (3rd arg)
    async (params: GetTaskParams) => {
      // Use inferred type
      const { taskId } = params;
      const result = await wrapApiCall(apiClient.getTask(taskId));
      if (!result.isError && result.content) {
        result.content.push({ type: "text", text: getTimeStatusNote });
      }
      return result;
    },
  );

  // Mark task complete tool
  const markCompleteShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to mark as complete."),
  };
  type MarkCompleteParams = z.infer<z.ZodObject<typeof markCompleteShape>>;

  server.tool(
    "reclaim_mark_complete",
    "Marks a specific Reclaim.ai task as completed/done by the user. This usually archives the task.", // Description (2nd arg)
    markCompleteShape, // Raw Shape (3rd arg)
    async (params: MarkCompleteParams) => wrapApiCall(apiClient.markTaskComplete(params.taskId)),
  );

  // Mark task incomplete tool
  const markIncompleteShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe(
      "The unique ID of the task to mark as incomplete (unarchive).",
    ),
  };
  type MarkIncompleteParams = z.infer<z.ZodObject<typeof markIncompleteShape>>;

  server.tool(
    "reclaim_mark_incomplete",
    "Marks a specific Reclaim.ai task as incomplete (e.g., unarchives it, moves it back to the planner).", // Description (2nd arg)
    markIncompleteShape, // Raw Shape (3rd arg)
    async (params: MarkIncompleteParams) =>
      wrapApiCall(apiClient.markTaskIncomplete(params.taskId)),
  );

  // Delete task tool
  const deleteTaskShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to delete."),
  };
  type DeleteTaskParams = z.infer<z.ZodObject<typeof deleteTaskShape>>;

  server.tool(
    "reclaim_delete_task",
    "Permanently delete a specific Reclaim.ai task. This action cannot be undone easily.", // Description (2nd arg)
    deleteTaskShape, // Raw Shape (3rd arg)
    async (params: DeleteTaskParams) => wrapApiCall(apiClient.deleteTask(params.taskId)),
  );

  // Add time to task tool
  const addTimeShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to add time to."),
    minutes: z
      .number()
      .int()
      .positive("Minutes must be a positive integer.")
      .describe("Number of minutes to add to the task schedule."),
  };
  type AddTimeParams = z.infer<z.ZodObject<typeof addTimeShape>>;

  server.tool(
    "reclaim_add_time",
    "Adds scheduled time (in minutes) to a specific Reclaim.ai task. This blocks more time on the user's calendar. Use this if a task needs more time than allocated (e.g., timeChunksRemaining is 0 but work remains) or if a task has status 'COMPLETE' but the user indicates it's not finished.", // Description (2nd arg)
    addTimeShape, // Raw Shape (3rd arg)
    async (params: AddTimeParams) =>
      wrapApiCall(apiClient.addTimeToTask(params.taskId, params.minutes)),
  );

  // Start task timer tool
  const startTimerShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to start the timer for."),
  };
  type StartTimerParams = z.infer<z.ZodObject<typeof startTimerShape>>;

  server.tool(
    "reclaim_start_timer",
    "Starts the live timer for a specific Reclaim.ai task. This indicates the user is actively working on it now and helps log time accurately.", // Description (2nd arg)
    startTimerShape, // Raw Shape (3rd arg)
    async (params: StartTimerParams) => wrapApiCall(apiClient.startTaskTimer(params.taskId)),
  );

  // Stop task timer tool
  const stopTimerShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to stop the timer for."),
  };
  type StopTimerParams = z.infer<z.ZodObject<typeof stopTimerShape>>;

  server.tool(
    "reclaim_stop_timer",
    "Stops the live timer for a specific Reclaim.ai task. Time tracked is automatically logged.", // Description (2nd arg)
    stopTimerShape, // Raw Shape (3rd arg)
    async (params: StopTimerParams) => wrapApiCall(apiClient.stopTaskTimer(params.taskId)),
  );

  // Log work for task tool
  const logWorkShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to log work against."),
    minutes: z
      .number()
      .int()
      .positive("Minutes must be a positive integer.")
      .describe("Number of minutes worked."),
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
      ),
  };
  type LogWorkParams = z.infer<z.ZodObject<typeof logWorkShape>>;

  server.tool(
    "reclaim_log_work",
    "Logs completed work time (in minutes) against a specific Reclaim.ai task. This reduces the remaining time needed and affects future scheduling.", // Description (2nd arg)
    logWorkShape, // Raw Shape (3rd arg)
    async (params: LogWorkParams) =>
      wrapApiCall(apiClient.logWorkForTask(params.taskId, params.minutes, params.end)),
  );

  // Clear task exceptions tool
  const clearExceptionsShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe(
      "The unique ID of the task whose scheduling exceptions should be cleared.",
    ),
  };
  type ClearExceptionsParams = z.infer<z.ZodObject<typeof clearExceptionsShape>>;

  server.tool(
    "reclaim_clear_exceptions",
    "Clears any scheduling exceptions (e.g., manual adjustments, declines) for a specific Reclaim.ai task, allowing it to reschedule normally.", // Description (2nd arg)
    clearExceptionsShape, // Raw Shape (3rd arg)
    async (params: ClearExceptionsParams) =>
      wrapApiCall(apiClient.clearTaskExceptions(params.taskId)),
  );

  // Prioritize task tool
  const prioritizeShape: ZodRawShape = {
    taskId: taskIdNumberSchema.describe("The unique ID of the task to prioritize."),
  };
  type PrioritizeParams = z.infer<z.ZodObject<typeof prioritizeShape>>;

  server.tool(
    "reclaim_prioritize",
    "Marks a specific Reclaim.ai task for prioritization ('On Deck'), increasing its likelihood of being scheduled sooner.", // Description (2nd arg)
    prioritizeShape, // Raw Shape (3rd arg)
    async (params: PrioritizeParams) => wrapApiCall(apiClient.prioritizeTask(params.taskId)),
  );
}
