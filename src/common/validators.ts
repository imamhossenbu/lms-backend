import { ValidateBy, type ValidationOptions } from "class-validator";
import { plainTextLength } from "./html";

/** Visible-text length of rich-text HTML must be within [min, max]. */
export function PlainTextLength(min: number, max: number, tooShort: string, tooLong: string, options?: ValidationOptions) {
  return ValidateBy(
    {
      name: "plainTextLength",
      validator: {
        validate: (v: unknown) => typeof v === "string" && plainTextLength(v) >= min && plainTextLength(v) <= max,
        defaultMessage: (args) => (typeof args?.value === "string" && plainTextLength(args.value) > max ? tooLong : tooShort),
      },
    },
    options,
  );
}
