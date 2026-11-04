import { Transform } from "class-transformer";

/**
 * Multipart form fields (file uploads) always arrive as strings. These convert them before validation,
 * and leave JSON numbers / booleans untouched.
 */
export const ToNumber = () =>
  Transform(({ value }) => (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value)) ? Number(value) : value));

export const ToBoolean = () =>
  Transform(({ value }) => (value === "true" || value === "1" ? true : value === "false" || value === "0" ? false : value));
