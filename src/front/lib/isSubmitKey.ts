/** The parts of a keyboard event the check needs, so it stays testable. */
export interface SubmitKeyEvent {
  key: string;
  shiftKey: boolean;
  isComposing: boolean;
  keyCode: number;
}

/** keyCode reported while an IME is converting; Safari omits `isComposing`. */
const IME_KEY_CODE = 229;

/**
 * Whether an Enter press should send the message.
 *
 * Enter during an IME conversion confirms the candidate — sending there would
 * fire the moment a Japanese phrase is confirmed, before the user has finished
 * writing. Shift+Enter stays reserved for a newline.
 */
export function isSubmitKey(event: SubmitKeyEvent): boolean {
  if (event.key !== "Enter") return false;
  if (event.shiftKey) return false;
  if (event.isComposing || event.keyCode === IME_KEY_CODE) return false;
  return true;
}
