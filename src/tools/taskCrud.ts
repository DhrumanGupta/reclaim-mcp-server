/**
 * @fileoverview Registers MCP Tools for creating and updating Reclaim.ai tasks (CRUD operations).
 */

import { z } from "zod";

import * as api from "../reclaim-client.js";
import { wrapApiCall } from "../utils.js";

import type { TaskInputData } from "../types/reclaim.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers task creation and update tools with the provided MCP Server instance.
 * Uses the (name, schema, handler) signature for server.tool.
 *
 * @param server - The McpServer instance to register tools against.
 */
export function registerTaskCrudTools(server: McpServer): void {
  // --- Zod Schema for Task Properties (used in both create and update) ---
  const taskPropertiesSchema = {
    title: z.string().min(1, "Title cannot be empty."),
    notes: z.string().optional(),
    eventCategory: z.enum(["WORK", "PERSONAL"]).optional(),
    eventSubType: z.string().optional(), // e.g., "MEETING", "FOCUS" - API specific
    priority: z.enum(["P1", "P2", "P3", "P4"]).optional(),
    timeChunksRequired: z
      .number()
      .int()
      .positive("Time chunks must be a positive integer.")
      .optional(), // 1 chunk = 15 mins
    onDeck: z.boolean().optional(), // Prioritize task
    status: z
      .enum([
        "NEW",
        "SCHEDULED",
        "IN_PROGRESS",
        "COMPLETE",
        "CANCELLED",
        "ARCHIVED",
      ])
      .optional(),
    // Deadline: number of days from now OR ISO datetime string OR YYYY-MM-DD date string
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
      .optional(),
    // SnoozeUntil: number of days from now OR ISO datetime string OR YYYY-MM-DD date string
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
      .optional(),
    eventColor: z
      .enum([
        // Based on Reclaim's standard colors
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
      .optional(),
  };

  // --- CREATE Task Tool ---
  server.tool(
    "reclaim_create_task",
    // Schema for create: title is required, other properties are optional
    taskPropertiesSchema, // Directly use the defined schema object
    async (params) => {
      // The 'params' object directly matches the schema structure
      // Cast to TaskInputData for the API client (which handles 'deadline'/'due' conversion)
      return wrapApiCall(api.createTask(params as TaskInputData));
    },
    // Consider adding annotations like description, idempotentHint=false
    // .annotations({ description: "Create a new task in Reclaim.ai", idempotentHint: false });
  );

  // --- UPDATE Task Tool ---
  server.tool(
    "reclaim_update_task",
    // Schema for update: requires taskId, all other properties are optional
    {
      taskId: z.number().int().positive("Task ID must be a positive integer."),
      // Make all properties from the base schema optional for update
      title: taskPropertiesSchema.title.optional(),
      notes: taskPropertiesSchema.notes,
      eventCategory: taskPropertiesSchema.eventCategory,
      eventSubType: taskPropertiesSchema.eventSubType,
      priority: taskPropertiesSchema.priority,
      timeChunksRequired: taskPropertiesSchema.timeChunksRequired,
      onDeck: taskPropertiesSchema.onDeck,
      status: taskPropertiesSchema.status,
      deadline: taskPropertiesSchema.deadline,
      snoozeUntil: taskPropertiesSchema.snoozeUntil,
      eventColor: taskPropertiesSchema.eventColor,
    },
    async (params) => {
      // Extract taskId, the rest are the update fields
      const { taskId, ...updateData } = params;

      // Ensure we have at least one property to update besides taskId
      if (Object.keys(updateData).length === 0) {
        // Throw an error that wrapApiCall will catch and format
        throw new Error(
          "Update requires at least one field to change besides taskId.",
        );
      }

      // Cast updateData to TaskInputData for the API client
      return wrapApiCall(api.updateTask(taskId, updateData as TaskInputData));
    },
    // Consider adding annotations like description, idempotentHint=true (usually)
    // .annotations({ description: "Update specific fields of an existing Reclaim.ai task.", idempotentHint: true });
  );
}
