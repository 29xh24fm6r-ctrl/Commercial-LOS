/**
 * Admin New Deal create capability truth — banker pilot vs public/global.
 *
 * `adminNewDealIntakeModel.ts`'s readiness table tracks the SEPARATE public/
 * global create path (`NEW_DEAL_INTAKE_LIVE_CREATE_ENABLED`, a governed
 * create adapter for that path). That table's "Governed create adapter" row
 * reporting "Not wired" describes ONLY the public/global adapter — but
 * `BankerNewDealCreate.tsx`'s pilot path is a DIFFERENT, already-live surface
 * (its own governed adapter, `createGovernedNewDeal`, gated by
 * `BANKER_CREATE_PILOT_ENABLED`), and nothing on the admin New Deal panel
 * said so in the same table an admin would actually read top-to-bottom.
 *
 * This module derives the banker pilot's own live/blocked truth from the
 * EXACT SAME runtime inputs `BankerNewDealCreate.tsx` evaluates at render
 * time (`evaluateBankerCreateRollout` + `bankerCreatePilotGateValues()` +
 * `BANKER_CREATE_PILOT`) — never a second, hand-maintained copy of that
 * logic that could quietly drift from the real component. The one
 * unavoidable difference: this is a static admin diagnostic with no specific
 * signed-in banker, so it evaluates "would an authorized banker's create be
 * live right now" rather than any particular actor's own authorization —
 * the same assumption `BankerNewDealCreate.tsx` itself makes about
 * `resolverReady` (always `true`; the adapter re-verifies at submit).
 */

import {
  evaluateBankerCreateRollout,
  describeBankerCreateRolloutState,
  type BankerCreateRolloutState,
} from '../deals/bankerNewDealCreateRollout';
import {
  BANKER_CREATE_PILOT,
  BANKER_CREATE_PILOT_ENABLED,
  bankerCreatePilotGateValues,
} from '../deals/bankerCreatePilotConfig';
import type { NewDealReadinessItem } from './adminNewDealIntakeModel';

/** Placeholder actor id — this diagnostic asks "is the CAPABILITY live for an
 *  authorized banker", not "is this admin authorized" (admins don't create
 *  deals through this pilot). */
const ASSUMED_AUTHORIZED_BANKER_ACTOR_ID = 'admin-diagnostic-assumed-authorized-banker';

/**
 * The banker pilot's rollout state computed from the exact same inputs
 * `BankerNewDealCreate.tsx` passes to `evaluateBankerCreateRollout` for an
 * authorized banker — `resolverReady: true` (the adapter re-verifies at
 * submit; this mirrors the component, it does not invent a separate claim).
 */
export const NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE: BankerCreateRolloutState = evaluateBankerCreateRollout({
  actorSystemUserId: ASSUMED_AUTHORIZED_BANKER_ACTOR_ID,
  bankerAuthorized: true,
  resolverReady: true,
  productionReferencesApproved: BANKER_CREATE_PILOT.productionReferencesApproved,
  environmentIsProduction: BANKER_CREATE_PILOT.environmentIsProduction,
  productionRolloutApproved: BANKER_CREATE_PILOT.productionRolloutApproved,
  gateValues: bankerCreatePilotGateValues(),
});

/** True only when the banker pilot is fully live for an authorized banker. */
export const NEW_DEAL_BANKER_PILOT_LIVE = NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE === 'live_controlled';

/** Plain-language reason the banker pilot is blocked; `null` when it's live. */
export const NEW_DEAL_BANKER_PILOT_BLOCKER: string | null = NEW_DEAL_BANKER_PILOT_LIVE
  ? null
  : describeBankerCreateRolloutState(NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE);

/**
 * Rows for the SAME readiness-table shape `NEW_DEAL_READINESS_TRUTH` uses, so
 * the admin panel can render both side by side with no ambiguity about which
 * path each row describes.
 */
export const NEW_DEAL_BANKER_PILOT_TRUTH: readonly NewDealReadinessItem[] = Object.freeze([
  Object.freeze({
    label: 'Banker pilot switch (BANKER_CREATE_PILOT_ENABLED)',
    value: BANKER_CREATE_PILOT_ENABLED ? 'On' : 'Off',
    done: BANKER_CREATE_PILOT_ENABLED,
  }),
  Object.freeze({
    label: 'Banker pilot create (BankerNewDealCreate, for an authorized banker)',
    value: NEW_DEAL_BANKER_PILOT_LIVE ? 'Live' : NEW_DEAL_BANKER_PILOT_ROLLOUT_STATE,
    done: NEW_DEAL_BANKER_PILOT_LIVE,
  }),
]);
