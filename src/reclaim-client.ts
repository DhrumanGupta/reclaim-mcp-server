/**
 * @fileoverview Provides a type-safe client for interacting with the Reclaim.ai REST API.
 * Handles API requests, responses, and basic error normalization.
 */

import axios, { type AxiosError, type AxiosInstance } from "axios";
import "dotenv/config";

// Fixed import path with .js extension
import {
  ReclaimError,
  type Task,
  type TaskInputData,
} from "./types/reclaim.js";

// --- Configuration ---

const TOKEN = process.env.RECLAIM_API_KEY;
if (!TOKEN) {
  // Use console.error for fatal startup issues
  console.error("FATAL: RECLAIM_API_KEY environment variable is not set.");
  console.error(
    "Please create a .env file in the project root with RECLAIM_API_KEY=your_api_token",
  );
  process.exit(1); // Exit if the token is missing, essential for operation
}

// --- Axios Instance ---

/**
 * Pre-configured Axios instance for making requests to the Reclaim.ai API.
 * Includes base URL and authorization header.
 */
export const reclaim: AxiosInstance = axios.create({
  baseURL: "https://api.app.reclaim.ai/api/",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json", // Explicitly accept JSON responses
  },
  // Optional: Add a timeout for requests
  // timeout: 10000, // 10 seconds
});

// --- Helper Functions ---

/**
 * Parses a deadline input into an ISO 8601 string suitable for the Reclaim API.
 * Handles inputs as number of days from now or a date/datetime string.
 * Defaults to 24 hours from the current time if parsing fails or input is invalid/missing.
 * Logic ported and refined from `prior-js-implementation.xml`.
 *
 * @param deadlineInput - The deadline specified as number of days from now,
 * an ISO 8601 date/time string, or undefined.
 * @returns An ISO 8601 date/time string representing the calculated deadline.
 */
export function parseDeadline(
  deadlineInput: number | string | undefined,
): string {
  const now = new Date();
  try {
    if (typeof deadlineInput === "number") {
      // Interpret number as days from now
      if (deadlineInput <= 0) {
        console.warn(
          `Received non-positive number of days "${deadlineInput}" for deadline/snooze, using current time.`,
        );
        // Or perhaps default to 24 hours? Let's default to now to avoid accidental pushing out.
        // throw new Error("Number of days must be positive.");
        return now.toISOString(); // Defaulting to 'now' might be safer than pushing out
      }
      const deadline = new Date(now);
      deadline.setDate(deadline.getDate() + deadlineInput);
      // Keep the current time, just advance the date
      return deadline.toISOString();
    } else if (typeof deadlineInput === "string") {
      // Attempt to parse as a date/datetime string
      const parsed = new Date(deadlineInput);
      if (isNaN(parsed.getTime())) {
        // Handle potential simple date format like YYYY-MM-DD by assuming start of day UTC
        if (/^\d{4}-\d{2}-\d{2}$/.test(deadlineInput)) {
          const [year, month, day] = deadlineInput.split("-").map(Number);
          // Month is 0-indexed in Date.UTC
          const utcDate = new Date(Date.UTC(year, month - 1, day));
          if (!isNaN(utcDate.getTime())) {
            return utcDate.toISOString();
          }
        }
        throw new Error(`Invalid date format: "${deadlineInput}"`);
      }
      return parsed.toISOString();
    }
    // If deadlineInput is undefined or null, fall through to default
  } catch (error) {
    // Log the specific error during parsing before defaulting
    console.error(
      `Failed to parse deadline/snooze input "${deadlineInput}", defaulting to 24 hours from now. Error: ${
        (error as Error).message
      }`,
    );
  }

  // Default case: 24 hours from now
  const defaultDeadline = new Date(now);
  defaultDeadline.setDate(defaultDeadline.getDate() + 1); // Add 1 day
  return defaultDeadline.toISOString();
}

/**
 * Filters an array of Task objects to include only those considered "active".
 *
 * **Important:** In Reclaim.ai, a task with `status: "COMPLETE"` means its scheduled time allocation
 * is finished, but the user may *not* have marked the task itself as done. These tasks
 * are considered "active" by this filter unless they are also `ARCHIVED`, `CANCELLED`, or `deleted`.
 *
 * Active tasks meet these criteria:
 * - `deleted` is `false`.
 * - `status` is **not** `ARCHIVED`.
 * - `status` is **not** `CANCELLED`.
 *
 * @param tasks - An array of `Task` objects.
 * @returns A new array containing only the active `Task` objects.
 */
export function filterActiveTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) {
    console.error(
      "filterActiveTasks received non-array input, returning empty array.",
    );
    return [];
  }
  return tasks.filter(
    (task) =>
      task && // Ensure task object exists
      !task.deleted &&
      task.status !== "ARCHIVED" &&
      task.status !== "CANCELLED",
  );
}

// --- API Methods ---

/**
 * Handles errors from Axios API calls, normalizing them into ReclaimError instances.
 * Logs the detailed error internally for server-side debugging.
 * This function is typed to return 'never' because it *always* throws an error.
 *
 * @param error - The error object caught from the Axios request (typed as unknown).
 * @param context - A string providing context for the API call (e.g., function name, parameters).
 * @throws {ReclaimError} Always throws a normalized ReclaimError.
 */
const handleApiError = (error: unknown, context: string): never => {
  let status: number | undefined;
  let detail: any;
  let message: string;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError; // Already checked with isAxiosError
    status = axiosError.response?.status;
    detail = axiosError.response?.data;
    // Try to extract a meaningful message from the response data or fallback to Axios message
    const responseData = detail; // Type assertion for easier access
    message =
      responseData?.message || responseData?.title || axiosError.message;
    console.error(
      `Reclaim API Error (${context}) - Status: ${status ?? "N/A"}`,
      detail || axiosError.message,
    );
  } else if (error instanceof Error) {
    message = error.message;
    detail = { stack: error.stack }; // Include stack for non-API errors
    console.error(`Error during Reclaim API call (${context})`, error);
  } else {
    // Handle cases where something other than an Error was thrown
    message = "An unexpected error occurred during API call.";
    detail = error; // Preserve the original thrown value
    console.error(
      `Unexpected throw during Reclaim API call (${context})`,
      error,
    );
  }

  // Throw a structured error for consistent handling upstream.
  // The 'never' return type indicates this function *always* throws.
  throw new ReclaimError(
    `API Call Failed (${context}): ${message}`,
    status,
    detail,
  );
};

/**
 * Fetches all tasks from the Reclaim API.
 *
 * **Note on `status: "COMPLETE"`:** See the documentation for `filterActiveTasks` for details.
 * This status indicates scheduled time completion, not necessarily user completion.
 *
 * @returns A promise resolving to an array of Task objects.
 * @throws {ReclaimError} If the API request fails.
 */
export async function listTasks(): Promise<Task[]> {
  const context = "listTasks";
  try {
    const { data } = await reclaim.get<Task[]>("/tasks");
    // It's possible the API returns non-array on error, though Axios usually throws. Add check.
    return Array.isArray(data) ? data : [];
  } catch (error) {
    // handleApiError always throws, satisfying the return type Promise<Task[]>
    return handleApiError(error, context);
  }
}

/**
 * Fetches a specific task by its unique ID.
 *
 * **Note on `status: "COMPLETE"`:** See the documentation for `filterActiveTasks` for details.
 * This status indicates scheduled time completion, not necessarily user completion.
 *
 * @param taskId - The numeric ID of the task to fetch.
 * @returns A promise resolving to the requested Task object.
 * @throws {ReclaimError} If the API request fails (e.g., task not found - 404).
 */
export async function getTask(taskId: number): Promise<Task> {
  const context = `getTask(taskId=${taskId})`;
  try {
    const { data } = await reclaim.get<Task>(`/tasks/${taskId}`);
    return data;
  } catch (error) {
    // handleApiError always throws, satisfying the return type Promise<Task>
    return handleApiError(error, context);
  }
}

/**
 * Creates a new task in Reclaim using the provided data.
 * @param taskData - An object containing the properties for the new task. See `TaskInputData`.
 * `title` is typically required by the API. `due` will be generated if `deadline` is omitted.
 * @returns A promise resolving to the newly created Task object as returned by the API.
 * @throws {ReclaimError} If the API request fails (e.g., validation error - 400).
 */
export async function createTask(taskData: TaskInputData): Promise<Task> {
  const context = "createTask";
  try {
    // API expects 'due', not 'deadline'. parseDeadline handles conversion and default.
    const apiPayload: Partial<TaskInputData> = { ...taskData }; // Clone to avoid modifying input object

    // Handle deadline/due conversion
    if ("deadline" in apiPayload && apiPayload.deadline !== undefined) {
      apiPayload.due = parseDeadline(apiPayload.deadline);
      delete apiPayload.deadline; // Remove original deadline field
    } else if (!apiPayload.due) {
      // Ensure 'due' exists, defaulting if neither 'due' nor 'deadline' provided
      apiPayload.due = parseDeadline(undefined); // Defaults to 24h
    }

    // Handle snoozeUntil conversion
    if ("snoozeUntil" in apiPayload && apiPayload.snoozeUntil !== undefined) {
      // Use parseDeadline logic for snoozeUntil as well
      apiPayload.snoozeUntil = parseDeadline(apiPayload.snoozeUntil);
    }

    // Clean undefined keys before sending to API
    Object.keys(apiPayload).forEach((key) => {
      if ((apiPayload as any)[key] === undefined) {
        delete (apiPayload as any)[key];
      }
    });

    const { data } = await reclaim.post<Task>("/tasks", apiPayload);
    return data;
  } catch (error) {
    // handleApiError always throws, satisfying the return type Promise<Task>
    return handleApiError(error, context);
  }
}

/**
 * Updates an existing task with the specified ID using the provided data.
 * Only the fields included in `taskData` will be updated (PATCH semantics).
 * @param taskId - The numeric ID of the task to update.
 * @param taskData - An object containing the properties to update. See `TaskInputData`.
 * @returns A promise resolving to the updated Task object as returned by the API.
 * @throws {ReclaimError} If the API request fails (e.g., task not found - 404, validation error - 400).
 */
export async function updateTask(
  taskId: number,
  taskData: TaskInputData,
): Promise<Task> {
  const context = `updateTask(taskId=${taskId})`;
  try {
    // API expects 'due', not 'deadline'. parseDeadline handles conversion.
    const apiPayload: Partial<TaskInputData> = { ...taskData }; // Clone to avoid modifying input object

    // Handle deadline/due conversion
    if ("deadline" in apiPayload && apiPayload.deadline !== undefined) {
      apiPayload.due = parseDeadline(apiPayload.deadline);
      delete apiPayload.deadline; // Remove original deadline field
    }

    // Handle snoozeUntil conversion
    if ("snoozeUntil" in apiPayload && apiPayload.snoozeUntil !== undefined) {
      apiPayload.snoozeUntil = parseDeadline(apiPayload.snoozeUntil);
    }

    // Remove undefined keys explicitly for PATCH safety
    Object.keys(apiPayload).forEach((key) => {
      if ((apiPayload as any)[key] === undefined) {
        delete (apiPayload as any)[key];
      }
    });

    // Ensure we are actually sending some data to update
    if (Object.keys(apiPayload).length === 0) {
      console.warn(
        `UpdateTask called for taskId ${taskId} with no fields to update. Skipping API call.`,
      );
      // Fetch and return the current task state as PATCH with no data is a no-op
      return getTask(taskId);
    }

    const { data } = await reclaim.patch<Task>(`/tasks/${taskId}`, apiPayload);
    return data;
  } catch (error) {
    // handleApiError always throws, satisfying the return type Promise<Task>
    return handleApiError(error, context);
  }
}

/**
 * Deletes a task by its unique ID.
 * Note: This is typically a soft delete in Reclaim unless forced otherwise.
 * @param taskId - The numeric ID of the task to delete.
 * @returns A promise resolving to void upon successful deletion (API returns 204 No Content).
 * @throws {ReclaimError} If the API request fails (e.g., task not found - 404).
 */
export async function deleteTask(taskId: number): Promise<void> {
  const context = `deleteTask(taskId=${taskId})`;
  try {
    await reclaim.delete(`/tasks/${taskId}`);
    // Successful deletion returns 204 No Content, promise resolves void implicitly
  } catch (error) {
    // handleApiError always throws. Since the return type is Promise<void>,
    // returning 'never' here also satisfies the compiler.
    return handleApiError(error, context);
  }
}

/**
 * Marks a task as complete in the Reclaim planner (user action).
 * @param taskId - The numeric ID of the task to mark complete.
 * @returns A promise resolving to the API response (often minimal or empty). Use `any` for flexibility or define a specific response type if known.
 * @throws {ReclaimError} If the API request fails.
 */
export async function markTaskComplete(taskId: number): Promise<any> {
  const context = `markTaskComplete(taskId=${taskId})`;
  try {
    // Endpoint might return empty body or a confirmation object
    const { data } = await reclaim.post(`/planner/done/task/${taskId}`);
    return data ?? { success: true }; // Provide a default success object if body is empty
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Marks a task as incomplete (e.g., unarchives it).
 * @param taskId - The numeric ID of the task to mark incomplete.
 * @returns A promise resolving to the API response (often minimal or empty). Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails.
 */
export async function markTaskIncomplete(taskId: number): Promise<any> {
  const context = `markTaskIncomplete(taskId=${taskId})`;
  try {
    const { data } = await reclaim.post(`/planner/unarchive/task/${taskId}`);
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Adds a specified amount of time to a task's schedule.
 * @param taskId - The numeric ID of the task.
 * @param minutes - The number of minutes to add (must be positive).
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails or minutes is invalid.
 */
export async function addTimeToTask(
  taskId: number,
  minutes: number,
): Promise<any> {
  const context = `addTimeToTask(taskId=${taskId}, minutes=${minutes})`;
  if (minutes <= 0) {
    // Throw an error immediately for invalid input, handled by wrapApiCall later
    throw new Error("Minutes must be positive to add time.");
  }
  try {
    // API expects minutes as a query parameter
    const { data } = await reclaim.post(
      `/planner/add-time/task/${taskId}`,
      null,
      {
        params: { minutes },
      },
    );
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Starts the timer for a specific task.
 * @param taskId - The numeric ID of the task to start the timer for.
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails.
 */
export async function startTaskTimer(taskId: number): Promise<any> {
  const context = `startTaskTimer(taskId=${taskId})`;
  try {
    const { data } = await reclaim.post(`/planner/start/task/${taskId}`);
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Stops the timer for a specific task.
 * @param taskId - The numeric ID of the task to stop the timer for.
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails.
 */
export async function stopTaskTimer(taskId: number): Promise<any> {
  const context = `stopTaskTimer(taskId=${taskId})`;
  try {
    const { data } = await reclaim.post(`/planner/stop/task/${taskId}`);
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Logs work (time spent) against a specific task.
 * @param taskId - The numeric ID of the task to log work against.
 * @param minutes - The number of minutes worked (must be positive).
 * @param end - Optional end time of the work session (ISO 8601 string or YYYY-MM-DD). If omitted, Reclaim usually assumes 'now'.
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails or parameters are invalid.
 */
export async function logWorkForTask(
  taskId: number,
  minutes: number,
  end?: string,
): Promise<any> {
  const context = `logWorkForTask(taskId=${taskId}, minutes=${minutes}, end=${end ?? "now"})`;
  if (minutes <= 0) {
    throw new Error("Minutes must be positive to log work.");
  }

  // Prepare query parameters, validating 'end' date if provided
  const params: { minutes: number; end?: string } = { minutes };
  if (end) {
    try {
      // Use parseDeadline to validate and normalize the end date string
      // Reclaim API seems to expect ISO string for 'end' param based on prior JS
      const parsedEnd = parseDeadline(end);
      // Ensure it includes time if only date was given - Reclaim might need time
      if (parsedEnd.length === 10) {
        // YYYY-MM-DD
        params.end = new Date(parsedEnd).toISOString(); // Convert to full ISO string
      } else {
        params.end = parsedEnd;
      }
    } catch (dateError: unknown) {
      // Throw a more specific error if parsing fails
      const message =
        dateError instanceof Error ? dateError.message : String(dateError);
      throw new Error(
        `Invalid 'end' date format: "${end}". Error: ${message}. Please use ISO 8601 or YYYY-MM-DD format.`,
      );
    }
  }

  try {
    const { data } = await reclaim.post(
      `/planner/log-work/task/${taskId}`,
      null,
      { params },
    );
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Clears any scheduling exceptions associated with a task.
 * @param taskId - The numeric ID of the task.
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails.
 */
export async function clearTaskExceptions(taskId: number): Promise<any> {
  const context = `clearTaskExceptions(taskId=${taskId})`;
  try {
    const { data } = await reclaim.post(
      `/planner/clear-exceptions/task/${taskId}`,
    );
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}

/**
 * Marks a task for prioritization in the Reclaim planner.
 * @param taskId - The numeric ID of the task to prioritize.
 * @returns A promise resolving to the API response. Use `any` for flexibility.
 * @throws {ReclaimError} If the API request fails.
 */
export async function prioritizeTask(taskId: number): Promise<any> {
  const context = `prioritizeTask(taskId=${taskId})`;
  try {
    const { data } = await reclaim.post(`/planner/prioritize/task/${taskId}`);
    return data ?? { success: true };
  } catch (error) {
    return handleApiError(error, context);
  }
}
