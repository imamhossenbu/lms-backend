import { isURL, registerDecorator, type ValidationArguments } from "class-validator";

export const SOCIAL_KEYS = ["linkedin", "twitter", "website"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type SocialLinks = Partial<Record<SocialKey, string>>;

const LABEL: Record<SocialKey, string> = { linkedin: "LinkedIn", twitter: "Twitter / X", website: "Website" };
const isHttpUrl = (v: string) => isURL(v, { require_protocol: true, protocols: ["http", "https"] });

/** First problem with a socials object, or null when valid. Unknown keys are rejected so nothing unexpected is stored. */
export function socialLinksError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "Social links must be an object";
  for (const [key, link] of Object.entries(value)) {
    if (!(SOCIAL_KEYS as readonly string[]).includes(key)) return `Unknown social link "${key}"`;
    if (typeof link !== "string") return `${LABEL[key as SocialKey]} link must be text`;
    const trimmed = link.trim();
    if (trimmed && !isHttpUrl(trimmed)) return `${LABEL[key as SocialKey]} link must be a full URL starting with http:// or https://`;
  }
  return null;
}

/** Validates `{ linkedin?, twitter?, website? }` with one readable message per problem. */
export function IsSocialLinks(): PropertyDecorator {
  return (target: object, propertyName: string | symbol) =>
    registerDecorator({
      name: "isSocialLinks",
      target: target.constructor,
      propertyName: String(propertyName),
      validator: {
        validate: (value: unknown) => socialLinksError(value) === null,
        defaultMessage: (args?: ValidationArguments) => socialLinksError(args?.value) ?? "Invalid social links",
      },
    });
}
