/**
 * @fileoverview Registers MCP Tools for creating and updating Reclaim.ai tasks (CRUD operations).
 */

import { z } from "zod";

import * as api from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TaskInputData } from "../types/reclaim.js";

/**
 * Registers task creation and update tools with the provided MCP Server instance.
 * Validates input parameters manually to return validation errors as ToolResults.
 *
 * @param server - The McpServer instance to register tools against.
 */
export function registerTaskCrudTools(server: McpServer): void {
  // --- Zod Schema for Task Properties (used in both create and update) ---
  const taskPropertiesSchema = z.object({
    title: z.string().min(1, "Title cannot be empty.").describe("Task title/name (required)"),
    notes: z.string().optional().describe("Additional notes or description for the task"),
    eventCategory: z
      .enum(["WORK", "PERSONAL"])
      .optional()
      .describe("Task category: WORK or PERSONAL (default: WORK)"),
    eventSubType: z
      .string()
      .optional()
      .describe('Event subtype (e.g., "MEETING", "FOCUS"). Usually auto-assigned by Reclaim.'),
    priority: z
      .enum(["P1", "P2", "P3", "P4"])
      .optional()
      .describe("Task priority: P1 (highest) to P4 (lowest). Default: P2"),
    timeChunksRequired: z
      .number()
      .int()
      .positive("Time chunks must be a positive integer.")
      .optional()
      .describe(
        "Duration in 15-minute chunks. 1 chunk = 15 minutes, 4 chunks = 1 hour, 8 chunks = 2 hours. Default: 4 (1 hour)",
      ),
    onDeck: z
      .boolean()
      .optional()
      .describe("Mark task as high priority 'on deck' for immediate scheduling"),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional()
      .describe("Task status (usually auto-managed by Reclaim)"),
    deadline: z
      .union([
        z.number().int().positive("Deadline days must be a positive integer."),
        z.string().datetime({
          message: "Deadline must be a valid ISO 8601 date/time string.",
        }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Deadline date must be in YYYY-MM-DD format.",
        }),
      ])
      .optional()
      .describe(
        'Task deadline. Formats: ISO 8601 with timezone (e.g., "2025-10-18T14:30:00Z"), date only (e.g., "2025-10-18"), or number of days from now. Default: 1 day from now',
      ),
    snoozeUntil: z
      .union([
        z.number().int().positive("Snooze days must be a positive integer."),
        z.string().datetime({
          message: "Snooze time must be a valid ISO 8601 date/time string.",
        }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Snooze date must be in YYYY-MM-DD format.",
        }),
      ])
      .optional()
      .describe(
        "Snooze task until this date/time. Same format options as deadline. Task will not be scheduled until this time.",
      ),
    eventColor: z
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
      .optional()
      .describe("Color for the task event on calendar"),
  });

  // --- CREATE Task Tool ---
  // Create a PERMISSIVE schema for SDK registration (so SDK validation doesn't reject)
  // We'll do strict validation inside the handler to return user-friendly ToolResults
  const createTaskSchemaForSdk = {
    title: z.string().describe("Task title/name (required)"),
    notes: z.string().optional().describe("Additional notes or description for the task"),
    eventCategory: z
      .enum(["WORK", "PERSONAL"])
      .optional()
      .describe("Task category: WORK or PERSONAL (default: WORK)"),
    eventSubType: z
      .string()
      .optional()
      .describe('Event subtype (e.g., "MEETING", "FOCUS"). Usually auto-assigned by Reclaim.'),
    priority: z
      .enum(["P1", "P2", "P3", "P4"])
      .optional()
      .describe("Task priority: P1 (highest) to P4 (lowest). Default: P2"),
    timeChunksRequired: z
      .number()
      .int()
      .optional()
      .describe(
        "Duration in 15-minute chunks. 1 chunk = 15 minutes, 4 chunks = 1 hour, 8 chunks = 2 hours. Default: 4 (1 hour)",
      ),
    onDeck: z
      .boolean()
      .optional()
      .describe("Mark task as high priority 'on deck' for immediate scheduling"),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional()
      .describe("Task status (usually auto-managed by Reclaim)"),
    // PERMISSIVE: Accept any string for deadline (strict validation in handler)
    deadline: z
      .union([z.number().int(), z.string()])
      .optional()
      .describe(
        'Task deadline. Formats: ISO 8601 with timezone (e.g., "2025-10-18T14:30:00Z"), date only (e.g., "2025-10-18"), or number of days from now. Default: 1 day from now',
      ),
    // PERMISSIVE: Accept any string for snoozeUntil (strict validation in handler)
    snoozeUntil: z
      .union([z.number().int(), z.string()])
      .optional()
      .describe(
        "Snooze task until this date/time. Same format options as deadline. Task will not be scheduled until this time.",
      ),
    eventColor: z
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
      .optional()
      .describe("Color for the task event on calendar"),
  };

  server.tool(
    "reclaim_create_task",
    createTaskSchemaForSdk, // Permissive schema for SDK
    async (params) => {
      // STRICT validation with detailed error messages as ToolResults
      const validation = taskPropertiesSchema.safeParse(params);

      if (!validation.success) {
        // Return validation errors as a ToolResult (not a protocol error)
        const errors = validation.error.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join("\n");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Validation Error:\n${errors}`,
            },
          ],
        };
      }

      // Validation succeeded, proceed with API call
      return wrapApiCall(api.createTask(validation.data as TaskInputData));
    },
  );

  // --- UPDATE Task Tool ---
  // Create update schema with taskId required, all other fields optional
  const updateTaskSchema = z.object({
    taskId: z
      .number()
      .int()
      .positive("Task ID must be a positive integer.")
      .describe("The unique ID of the task to update (required)"),
    title: z.string().min(1, "Title cannot be empty.").optional().describe("New task title/name"),
    notes: z.string().optional().describe("New notes or description"),
    eventCategory: z
      .enum(["WORK", "PERSONAL"])
      .optional()
      .describe("New task category: WORK or PERSONAL"),
    eventSubType: z.string().optional().describe('New event subtype (e.g., "MEETING", "FOCUS")'),
    priority: z
      .enum(["P1", "P2", "P3", "P4"])
      .optional()
      .describe("New priority: P1 (highest) to P4 (lowest)"),
    timeChunksRequired: z
      .number()
      .int()
      .positive("Time chunks must be a positive integer.")
      .optional()
      .describe(
        "New duration in 15-minute chunks. 1 chunk = 15 min, 4 chunks = 1 hour, 8 chunks = 2 hours",
      ),
    onDeck: z.boolean().optional().describe("Mark/unmark task as 'on deck' for prioritization"),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional()
      .describe("New task status"),
    deadline: z
      .union([
        z.number().int().positive("Deadline days must be a positive integer."),
        z.string().datetime({
          message: "Deadline must be a valid ISO 8601 date/time string.",
        }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Deadline date must be in YYYY-MM-DD format.",
        }),
      ])
      .optional()
      .describe(
        'New deadline. Formats: ISO 8601 with timezone (e.g., "2025-10-18T14:30:00Z"), date only (e.g., "2025-10-18"), or number of days from now',
      ),
    snoozeUntil: z
      .union([
        z.number().int().positive("Snooze days must be a positive integer."),
        z.string().datetime({
          message: "Snooze time must be a valid ISO 8601 date/time string.",
        }),
        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Snooze date must be in YYYY-MM-DD format.",
        }),
      ])
      .optional()
      .describe("New snooze date/time. Same format options as deadline."),
    eventColor: z
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
      .optional()
      .describe("New calendar color for the task"),
  });

  // Create PERMISSIVE schema for SDK (allows any string for dates)
  const updateTaskSchemaForSdk = {
    taskId: z
      .number()
      .int()
      .positive("Task ID must be a positive integer.")
      .describe("The unique ID of the task to update (required)"),
    title: z.string().min(1, "Title cannot be empty.").optional().describe("New task title/name"),
    notes: z.string().optional().describe("New notes or description"),
    eventCategory: z
      .enum(["WORK", "PERSONAL"])
      .optional()
      .describe("New task category: WORK or PERSONAL"),
    eventSubType: z.string().optional().describe('New event subtype (e.g., "MEETING", "FOCUS")'),
    priority: z
      .enum(["P1", "P2", "P3", "P4"])
      .optional()
      .describe("New priority: P1 (highest) to P4 (lowest)"),
    timeChunksRequired: z
      .number()
      .int()
      .optional()
      .describe(
        "New duration in 15-minute chunks. 1 chunk = 15 min, 4 chunks = 1 hour, 8 chunks = 2 hours",
      ),
    onDeck: z.boolean().optional().describe("Mark/unmark task as 'on deck' for prioritization"),
    status: z
      .enum(["NEW", "SCHEDULED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "ARCHIVED"])
      .optional()
      .describe("New task status"),
    // PERMISSIVE: Accept any string for deadline (strict validation in handler)
    deadline: z
      .union([z.number().int(), z.string()])
      .optional()
      .describe(
        'New deadline. Formats: ISO 8601 with timezone (e.g., "2025-10-18T14:30:00Z"), date only (e.g., "2025-10-18"), or number of days from now',
      ),
    // PERMISSIVE: Accept any string for snoozeUntil (strict validation in handler)
    snoozeUntil: z
      .union([z.number().int(), z.string()])
      .optional()
      .describe("New snooze date/time. Same format options as deadline."),
    eventColor: z
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
      .optional()
      .describe("New calendar color for the task"),
  };

  server.tool(
    "reclaim_update_task",
    updateTaskSchemaForSdk, // Permissive schema for SDK
    async (params) => {
      // Re-validate with strict schema inside handler
      const validation = updateTaskSchema.safeParse(params);

      if (!validation.success) {
        // Return validation errors as a ToolResult (not a protocol error)
        const errors = validation.error.errors
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join("\n");
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Validation Error:\n${errors}`,
            },
          ],
        };
      }

      // Extract taskId, the rest are the update fields
      const { taskId, ...updateData } = validation.data;

      // Ensure we have at least one property to update besides taskId
      if (Object.keys(updateData).length === 0) {
        // Return validation error as ToolResult
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: "Validation Error:\nUpdate requires at least one field to change besides taskId.",
            },
          ],
        };
      }

      // Cast updateData to TaskInputData for the API client
      return wrapApiCall(api.updateTask(taskId, updateData as TaskInputData));
    },
  );
}
