import { useEffect, useState } from 'react';
import { useDealData } from './DealDataProvider';
import { useOptionalBanker } from '../banker/BankerContext';
import { Card, CardHeader } from '../shared/Card';
import {
  buildTeamsChatDeepLink,
  initializeTeamsContext,
} from '../shared/teams/teamsEnvironment';
import { palette, radius, spacing, typography } from '../shared/theme';

/**
 * Phase 86: Microsoft Teams chat handoff card.
 *
 * What this is:
 *   A no-admin "Open Teams chat" deep-link affordance on the Banker
 *   Deal Workspace. Clicking the button opens the user's own
 *   Microsoft Teams client (web or desktop) to the new-chat composer
 *   pre-tagged with:
 *     - the banker's own email as the target user (the Phase 4
 *       authorization step guarantees the signed-in banker is the
 *       deal's assigned banker),
 *     - the deal name as the chat topic,
 *     - a short context line as the prefilled message.
 *   The banker can adjust the recipient(s) and the message inside
 *   their own Teams client. THIS APP NEVER SENDS A MESSAGE.
 *
 * What this is NOT (intentional non-capabilities):
 *   - Not a Teams integration. The app does not post to Teams, read
 *     from Teams, sync with Teams, or hold any Teams credential.
 *   - Not a notification surface. The app does not push a Teams
 *     activity-feed notification on the user's behalf.
 *   - Not a calendar surface. The app does not read or write any
 *     calendar event.
 *   - Not a meeting surface. The app does not create an online
 *     meeting; the schema has no slot for one and Graph is not
 *     wired.
 *   - Not a Graph caller. No token acquisition, no Graph API calls.
 *   - Not a Dataverse write. No audit row, no timeline event, no
 *     governed-write entry.
 *
 * UPN source:
 *   `useOptionalBanker().email` — the signed-in banker's verified
 *   email from the Phase 4 bootstrap chain (Cr664_users row matched
 *   to the Entra UPN). NEVER inferred from borrower / client name.
 *   When the banker context isn't available (e.g. unsigned-in test
 *   mount) the card renders a disabled "no user email is available"
 *   state.
 */

export function TeamsChatHandoff() {
  const banker = useOptionalBanker();
  const { deal } = useDealData();
  const email = banker?.email?.trim() ?? '';

  // Fire-and-forget probe. Result is informational (diagnostic
  // badge); the handoff works regardless of whether the SDK reports
  // "in Teams" — the deep link opens Teams' web client when the
  // user is not in the desktop / mobile clients.
  const [probe, setProbe] = useState<'pending' | 'available' | 'unavailable'>(
    'pending',
  );
  useEffect(() => {
    let cancelled = false;
    initializeTeamsContext()
      .then((result) => {
        if (cancelled) return;
        setProbe(result.kind === 'available' ? 'available' : 'unavailable');
      })
      .catch(() => {
        if (cancelled) return;
        setProbe('unavailable');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const deepLink = email
    ? buildTeamsChatDeepLink({
        userEmail: email,
        topic: deal.name,
        message: `Re: ${deal.name}`,
      })
    : null;

  const handleOpen = () => {
    if (!deepLink) return;
    // _blank + noopener + noreferrer is the standard safe handoff
    // pattern Phase 63 already uses for Outlook mailto: links. The
    // app does not retain a handle to the opened window.
    window.open(deepLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <Card>
      <CardHeader
        title="Open Teams chat"
        subtitle="Handoff to your Microsoft Teams client. The app does not post to, read from, or sync with Teams."
      />
      {deepLink ? (
        <div style={styles.body}>
          <p style={styles.lead}>
            Clicking opens your Teams client with a new chat pre-tagged
            with this deal as the topic. <strong>You send the
            message</strong> — the app does not send anything.
          </p>
          <div style={styles.actionRow}>
            <button
              type="button"
              onClick={handleOpen}
              style={styles.primaryButton}
              aria-label={`Open Teams chat about ${deal.name}`}
            >
              Open Teams chat
            </button>
            {probe === 'available' && (
              <span style={styles.probeBadge} aria-label="Detected Teams host">
                Detected: running inside Teams
              </span>
            )}
            {probe === 'unavailable' && (
              <span style={styles.probeBadgeMuted} aria-label="Teams host not detected">
                Not running inside Teams · the link opens Teams web
              </span>
            )}
          </div>
          <p style={styles.disclaimer}>
            Local handoff only. No Dataverse write. No audit row. No
            timeline event. No calendar update. No meeting created. No
            Teams notification raised. No Graph call. The recipient
            and message can be edited inside your Teams client before
            you send.
          </p>
        </div>
      ) : (
        <div style={styles.body}>
          <p style={styles.disabledLead} role="status">
            Teams chat handoff unavailable because no user email is
            available.
          </p>
          <p style={styles.disclaimer}>
            The handoff needs a verified signed-in user email. It is
            not inferred from borrower or client name. If you are
            signed in and still see this message, your user profile
            may not carry an email yet.
          </p>
        </div>
      )}
    </Card>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing.sm,
  },
  lead: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.text,
    lineHeight: typography.lineHeight.snug,
  },
  disabledLead: {
    margin: 0,
    fontSize: typography.size.sm,
    color: palette.textMuted,
    fontStyle: 'italic',
    lineHeight: typography.lineHeight.snug,
  },
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  primaryButton: {
    background: palette.primary,
    color: palette.surface,
    border: 'none',
    borderRadius: radius.sm,
    padding: `${spacing.sm} ${spacing.md}`,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    cursor: 'pointer',
    fontFamily: typography.family,
  },
  probeBadge: {
    fontSize: typography.size.xs,
    color: palette.clearFg,
    fontStyle: 'italic',
  },
  probeBadgeMuted: {
    fontSize: typography.size.xs,
    color: palette.textSubtle,
    fontStyle: 'italic',
  },
  disclaimer: {
    margin: 0,
    paddingTop: spacing.xs,
    fontSize: typography.size.xs,
    color: palette.textMuted,
    lineHeight: typography.lineHeight.snug,
    borderTop: `1px dashed ${palette.divider}`,
  },
};
