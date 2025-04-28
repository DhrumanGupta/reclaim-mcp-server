/**
 * @fileoverview Registers MCP Tools for creating and updating Reclaim.ai tasks (CRUD operations).
 */

import { z } from "zod";
import type { ZodRawShape, ZodTypeAny } from "zod"; // Import ZodRawShape type

import * as defaultApi from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ReclaimApiClient, TaskInputData } from "../types/reclaim.js";

// Define type for the API client methods needed here
type CrudApiClient = Pick<ReclaimApiClient, "createTask" | "updateTask">;

// Define complex types separately for reuse in raw shapes
const deadlineSchemaType = z
  .union([
    z.number().int().positive("Deadline days must be a positive integer."),
    z.string().datetime({ message: "Deadline must be a valid ISO 8601 date/time string." }),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Deadline date must be in YYYY-MM-DD format." }),
  ])
  .optional();

const snoozeUntilSchemaType = z
  .union([
    z.number().int().positive("Snooze days must be a positive integer."),
    z.string().datetime({ message: "Snooze time must be a valid ISO 8601 date/time string." }),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Snooze date must be in YYYY-MM-DD format." }),
  ])
  .optional();

const eventColorSchemaType = z
  .enum([
    "LAVENDER",
    "SAGE",
    "GRAPE",
    "FLAMINGO",
    "BANANA",
    "TANGERINE",
    "PEACOCK",
    "GRAPHITE",
    "BLUEBERRY",
    "BASIL",
    "TOMATO",
  ])
  .optional();

/**
 * Registers task creation and update tools with the provided MCP Server instance.
 * Uses the (name, description, rawShape, handler) signature based on TS errors and analysis.
 * Handler parameter types are inferred using z.infer.
 *
 * @param server - The McpServer instance to register handlers against.
 * @param apiClient - Optional API client for dependency injection (used in testing).
 */
export function registerTaskCrudTools(
  server: McpServer,
  apiClient: CrudApiClient = defaultApi, // Use the specific client type
): void {
  // --- Define Raw Shapes for Zod Schemas ---
  const taskPropertiesShape: ZodRawShape = {
    title: z.string().min(1, "Title cannot be empty."),
    notes: z.string().optional(),
    eventCategory: z.enum(["WORK", "PERSONAL"]).optional(),
    eventSubType: z.string().optional(),
    priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
    timeChunksRequired: z
      .number()
      .int()
      .positive("Time chunks must be a positive integer.")
      .optional(),
    onDeck: z.boolean().optional(),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional(),
    deadline: deadlineSchemaType,
    snoozeUntil: snoozeUntilSchemaType,
    eventColor: eventColorSchemaType,
  };
  // Infer type for handler params from the shape
  type CreateTaskParams = z.infer<z.ZodObject<typeof taskPropertiesShape>>;

  // --- CREATE Task Tool ---
  server.tool(
    "reclaim_create_task",
    "Create a new task in Reclaim.ai. Requires at least a 'title'. Other fields like 'timeChunksRequired', 'priority', 'deadline', 'notes', 'eventCategory' are optional but recommended.", // Description (2nd arg)
    taskPropertiesShape, // RAW SHAPE object (3rd arg)
    // Use inferred type for params
    async (params: CreateTaskParams) => {
      // Now params is strongly typed
      return wrapApiCall(apiClient.createTask(params as TaskInputData));
    },
  );

  // --- UPDATE Task Tool ---
  const updateTaskShape: ZodRawShape = {
    taskId: z.number().int().positive("Task ID must be a positive integer."),
    title: z.string().min(1, "Title cannot be empty.").optional(),
    notes: z.string().optional(),
    eventCategory: z.enum(["WORK", "PERSONAL"]).optional(),
    eventSubType: z.string().optional(),
    priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
    timeChunksRequired: z
      .number()
      .int()
      .positive("Time chunks must be a positive integer.")
      .optional(),
    onDeck: z.boolean().optional(),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional(),
    deadline: deadlineSchemaType,
    snoozeUntil: snoozeUntilSchemaType,
    eventColor: eventColorSchemaType,
  };
  // Infer type for handler params from the shape
  type UpdateTaskParams = z.infer<z.ZodObject<typeof updateTaskShape>>;

  server.tool(
    "reclaim_update_task",
    "Update specific fields of an existing Reclaim.ai task using its ID. This performs a PATCH operation – only provided fields are changed.\nIMPORTANT: Updating fields like 'notes' overwrites the existing content. To *append* to notes, you MUST first use 'reclaim_get_task' to fetch the current notes, then provide the full combined text (old + new) in the 'notes' field of this update call.", // Description (2nd arg)
    updateTaskShape, // RAW SHAPE object (3rd arg)
    // Use inferred type for params
    async (params: UpdateTaskParams) => {
      // Now params is strongly typed
      const { taskId, ...updateData } = params;

      if (Object.keys(updateData).length === 0) {
        throw new Error("Update requires at least one field to change besides taskId.");
      }
      return wrapApiCall(apiClient.updateTask(taskId, updateData as TaskInputData));
    },
  );
}
