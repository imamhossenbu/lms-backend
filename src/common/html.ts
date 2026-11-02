import sanitize from "sanitize-html";

/**
 * Server-side allowlist for rich-text editor output — mirrors the admin panel's src/lib/sanitizeHtml.ts:
 * basic formatting tags only, every attribute dropped except a safe http(s)/mailto `href` on links.
 * Never trust the client's sanitizing; always run this before storing HTML.
 */
export function sanitizeRichText(html: string): string {
  return sanitize(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "a", "h1", "h2", "h3", "blockquote", "code", "pre", "hr"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: { a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
    // Drop dangerous elements together with their content; other unknown tags are unwrapped.
    nonTextTags: ["script", "style", "iframe", "object", "embed", "textarea", "noscript"],
  }).trim();
}

/** Visible text length of an HTML fragment (for "at least N characters" rules). */
export const plainTextLength = (html: string) => sanitize(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim().length;
