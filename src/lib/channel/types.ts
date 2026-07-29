/**
 * Channel boundary. The agent core is channel-agnostic; Telegram is the primary
 * real channel and SimChannel is used for local dev and tests. WhatsApp (or any
 * other surface) can be added later behind this same interface.
 */

export interface IncomingMessage {
  /** Stable per-user channel id → maps to a Kudi session. */
  readonly chatId: string;
  readonly userId: string;
  /** Text the user typed, or the transcript of a voice note. */
  readonly text: string;
  /** True when `text` came from speech-to-text. */
  readonly fromVoice: boolean;
  /** Opaque per-message id for logging/idempotency. */
  readonly messageId: string;
}

/** A tappable choice rendered as a button (Telegram inline keyboard). */
export interface ChannelButton {
  readonly label: string;
  /** Callback payload sent back when tapped. Kept short. */
  readonly data: string;
  readonly kind?: "confirm" | "cancel" | "default";
}

export interface OutgoingMessage {
  readonly chatId: string;
  readonly text: string;
  /** Optional rows of buttons for a confirmation gate / choices. */
  readonly buttons?: readonly (readonly ChannelButton[])[];
}

/** A button press coming back from the channel. */
export interface CallbackEvent {
  readonly chatId: string;
  readonly userId: string;
  readonly data: string;
  readonly callbackId: string;
}

export interface Channel {
  readonly name: "telegram" | "sim";
  send(msg: OutgoingMessage): Promise<void>;
  /** Acknowledge a button tap so the client stops its spinner. */
  answerCallback?(callbackId: string, text?: string): Promise<void>;
}
