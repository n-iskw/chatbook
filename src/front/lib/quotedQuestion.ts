/**
 * A question with the passage it is about quoted above it.
 *
 * The quote travels inside the message rather than beside it: the thread is
 * stored as plain content, so anything kept outside it would be lost on the
 * next read of the history and never reach the model.
 *
 * Every line is prefixed, blank ones included — an unprefixed blank line ends a
 * markdown blockquote, which would turn the rest of the passage into the
 * question.
 */
export function formatQuotedQuestion(quote: string, question: string): string {
  const quoted = quote
    .trim()
    .split("\n")
    .map((line) => (line.trim() === "" ? ">" : `> ${line}`))
    .join("\n");

  return `${quoted}\n\n${question}`;
}
