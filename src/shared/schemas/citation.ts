import { z } from "zod";
import { pageMissSchema } from "./book";

/**
 * A source the assistant named in its `## Sources` section. PDF citations carry
 * the page the passage was found on; web citations carry the page's URL.
 *
 * `pageNumber` and `pageMiss` are the two halves of one answer and never both
 * appear, but they are kept as optional fields rather than a union because
 * citations are stored as JSON and the rows written before `pageMiss` existed
 * still have to parse.
 */
export const citationSchema = z.object({
  id: z.string(),
  type: z.enum(["pdf", "web"]),
  text: z.string(),
  pageNumber: z.number().int().positive().optional(),
  pageMiss: pageMissSchema.optional(),
  url: z.string().optional(),
});

export type Citation = z.infer<typeof citationSchema>;
