/**
 * @fileoverview Shared TypeScript types for Reclaim.ai API interactions.
 */

// Based on observed API usage and prior JS implementation details.
// Refine these based on actual API responses or Swagger/OpenAPI specs if available.

export interface Task {
  id: number;
  title: string;
  notes?: string;
  eventCategory?: "WORK" | "PERSONAL";
  eventSubType?: string; // e.g., "FOCUS", "MEETING"
  priority?: "P1" | "P2" | "P3" | "P4";
  timeChunksRequired?: number; // In 15-min increments
  timeChunksSpent?: number;
  timeChunksRemaining?: number;
  minChunkSize?: number; // In 15-min increments
  maxChunkSize?: number; // In 15-min increments
  /**
   * Task status in Reclaim.ai.
   * **Important:** `COMPLETE` status means the task has finished its *scheduled time allocation*,
   * but the user may *not* have marked the task as actually done. Such tasks are still
   * considered "active" for filtering purposes unless `ARCHIVED`, `CANCELLED`, or `deleted`.
   */
  status?:
    | "NEW"
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "COMPLETE"
    | "CANCELLED"
    | "ARCHIVED";
  due?: string; // ISO 8601 format (e.g., "2025-04-22T03:44:52.081Z")
  snoozeUntil?: string; // ISO 8601 format
  eventColor?: string; // e.g., 'GRAPE', 'LAVENDER', 'GRAPHITE'
  deleted?: boolean;
  onDeck?: boolean; // User wants to prioritize this next
  created?: string; // ISO 8601 format
  updated?: string; // ISO 8601 format
  finished?: string; // ISO 8601 format - Time the task was marked complete or time ran out? Check API docs.
  adjusted?: boolean; // Was the schedule adjusted?
  atRisk?: boolean; // Is the deadline at risk?
  timeSchemeId?: string; // UUID linking to time scheduling rules
  index?: number; // Internal sorting index?
  alwaysPrivate?: boolean; // Should event always be private on calendar?
  sortKey?: number; // Internal sorting key?
  taskSource?: { type: string; [key: string]: any }; // Origin (e.g., RECLAIM_APP, GOOGLE_CALENDAR)
  readOnlyFields?: string[]; // Fields that cannot be modified
  type?: "TASK" | "HABIT"; // Type of item
  recurringAssignmentType?: string; // How recurrence is handled
  // Allow for additional properties not explicitly defined, as API might add fields
  [key: string]: any;
}

export interface TaskInputData {
  title?: string; // Required for create, optional for update
  notes?: string;
  eventCategory?: "WORK" | "PERSONAL";
  eventSubType?: string;
  priority?: "P1" | "P2" | "P3" | "P4";
  timeChunksRequired?: number; // 1 chunk = 15 mins
  onDeck?: boolean;
  /**
   * Task status. See `Task` interface for notes on the `COMPLETE` status meaning.
   */
  status?:
    | "NEW"
    | "SCHEDULED"
    | "IN_PROGRESS"
    | "COMPLETE"
    | "CANCELLED"
    | "ARCHIVED";
  /** Deadline for the task. Handled by `parseDeadline` in API client. Can be number (days from now) or ISO/YYYY-MM-DD string. */
  deadline?: number | string;
  /** Date until task is snoozed. Handled by `parseDeadline` in API client. Can be number (days from now) or ISO/YYYY-MM-DD string. */
  snoozeUntil?: number | string;
  eventColor?: string; // e.g., "LAVENDER", "SAGE", ...
  /** Used internally by API client, represents the ISO string for the deadline. Do not set directly if using `deadline`. */
  due?: string;
  /** Minimum chunk size for task scheduling (in 15-min increments). Controls smallest time block for this task. */
  minChunkSize?: number;
  /** Maximum chunk size for task scheduling (in 15-min increments). Controls largest time block for this task. */
  maxChunkSize?: number;
}

/**
 * Custom error class for Reclaim API specific errors.
 * Includes optional status code and detailed error response.
 */
export class ReclaimError extends Error {
  status?: number;
  detail?: any;

  constructor(message: string, status?: number, detail?: any) {
    super(message);
    this.name = "ReclaimError";
    this.status = status;
    this.detail = detail;

    // Maintains proper stack trace in V8 environments (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ReclaimError);
    }
  }
}
