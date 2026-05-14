/**
 * Phase 61: Outlook send adapter port.
 *
 * The port is the typed interface every send mechanism conforms to.
 * Today there are two implementations (DRY_RUN, LIVE-stub); when the
 * Office 365 Outlook connector is registered for the Code App the
 * LIVE adapter's `send` method swaps in the typed connector call.
 * The action layer never imports a connector service directly — it
 * always receives an adapter via dependency injection so tests can
 * stub the boundary cleanly.
 *
 * Result shape:
 *   - 'accepted' — the underlying transport accepted the message for
 *     delivery. In DRY_RUN this means "the adapter validated the
 *     inputs"; in LIVE this will mean "Outlook returned a 2xx and a
 *     message id." `providerMessageId` is best-effort: present when
 *     the transport returns one; undefined when it does not (DRY_RUN
 *     always returns undefined).
 *   - 'invalid-recipient' — the recipient string failed the local
 *     shape check before any transport call was attempted. Always a
 *     permanent failure; retrying the same recipient cannot help.
 *   - 'transient-failure' — the transport reported a recoverable
 *     failure (network, throttle, 5xx). The caller may surface a
 *     "try again" affordance.
 *   - 'permanent-failure' — the transport reported a non-recoverable
 *     failure (permission denied, mailbox over quota, connector not
 *     wired). The caller must NOT retry without operator action.
 *
 * Discipline:
 *   - The port is pure data + a method signature. No SDK import, no
 *     Power Apps package import, no role-module import.
 *   - The mode discriminator on the port lets the modal surface the
 *     active mode without re-reading import.meta.env.
 */

export interface OutlookEmailInput {
  recipient: string;
  subject: string;
  body: string;
  /** Correlation id stamped on the audit + timeline rows the action
   *  emits. The adapter does not write it anywhere; it's provided so
   *  log lines from the underlying transport can be correlated with
   *  the Dataverse rows if the transport supports custom headers. */
  correlationId: string;
}

export type OutlookSendResult =
  | { kind: 'accepted'; providerMessageId: string | undefined }
  | { kind: 'invalid-recipient'; reason: string }
  | { kind: 'transient-failure'; reason: string }
  | { kind: 'permanent-failure'; reason: string };

export interface OutlookEmailPort {
  /** Discriminator surfaced to the UI so it can render an unambiguous
   *  mode badge. */
  readonly mode: 'DRY_RUN' | 'LIVE';
  send(input: OutlookEmailInput): Promise<OutlookSendResult>;
}
