/**
 * Phase 261 (B) — live CRM write functions for the UI.
 *
 * Binds the governed adapters to the live Dataverse deps so the CRM workspace
 * can be handed a single object of write functions (and tests can inject a fake
 * one). Each function takes the full governed input (including the actor) and
 * returns the discriminated outcome.
 */

import {
  addCompany,
  addContact,
  logActivity,
  createFollowUpTask,
  addRelationship,
  buildLiveCrmWriteDeps,
  type AddCompanyInput,
  type AddContactInput,
  type LogActivityInput,
  type FollowUpTaskInput,
  type AddRelationshipInput,
  type CrmWriteOutcome,
} from './crmWriteAdapter';
import { addAdvisorLink, type AddAdvisorLinkInput } from '../advisors/advisorLink';
import {
  bridgeOrgToClientRelationship,
  buildLiveBridgeOrgToClientDeps,
  type BridgeOrgToClientInput,
  type BridgeOrgToClientOutcome,
} from './bridgeOrgToClientRelationship';

export interface CrmWriteFns {
  readonly addCompany: (input: AddCompanyInput) => Promise<CrmWriteOutcome>;
  readonly addContact: (input: AddContactInput) => Promise<CrmWriteOutcome>;
  readonly logActivity: (input: LogActivityInput) => Promise<CrmWriteOutcome>;
  readonly createFollowUpTask: (input: FollowUpTaskInput) => Promise<CrmWriteOutcome>;
  readonly addRelationship: (input: AddRelationshipInput) => Promise<CrmWriteOutcome>;
  readonly addAdvisorLink: (input: AddAdvisorLinkInput) => Promise<CrmWriteOutcome>;
  /** Governed mirror of an EXISTING Borrower/Client company into the deal-linkable
   *  cr664_clientrelationship. Only ever run for an already-created company. */
  readonly bridgeOrgToClient: (input: BridgeOrgToClientInput) => Promise<BridgeOrgToClientOutcome>;
}

export function buildLiveCrmWriteFns(): CrmWriteFns {
  const deps = buildLiveCrmWriteDeps();
  const bridgeDeps = buildLiveBridgeOrgToClientDeps();
  return {
    addCompany: (input) => addCompany(input, deps),
    addContact: (input) => addContact(input, deps),
    logActivity: (input) => logActivity(input, deps),
    createFollowUpTask: (input) => createFollowUpTask(input, deps),
    addRelationship: (input) => addRelationship(input, deps),
    addAdvisorLink: (input) => addAdvisorLink(input, deps),
    bridgeOrgToClient: (input) => bridgeOrgToClientRelationship(input, bridgeDeps),
  };
}
