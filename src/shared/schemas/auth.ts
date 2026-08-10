import { z } from "zod";

/**
 * What the reader types to get in.
 *
 * Bounded so a request cannot make the server hash a megabyte, and trimmed
 * nowhere: a password whose spaces were stripped is a different password.
 */
export const loginRequestSchema = z.object({
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(200),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * The answer to "am I still signed in".
 *
 * A bare `true` rather than anything about who: there is one account, so the
 * only thing the browser needs back is whether to draw the reader or the
 * password box.
 */
export const sessionSchema = z.object({
  signedIn: z.literal(true),
});

export type Session = z.infer<typeof sessionSchema>;

/** The answer to logging out, kept distinct so a confused reply is not read as success. */
export const sessionEndedSchema = z.object({
  signedIn: z.literal(false),
});
