/**
 * Phase 142H — Competitive roadmap deriver.
 *
 * PURE. Produces the governed forward roadmap (Phases 142I-T). Every phase
 * carries a risk class, prerequisites, deliverables, forbidden actions, and
 * readiness criteria. No phase enables final credit decision automation, none
 * bypasses disabled-by-default integrations, schema mutation stays operator-script
 * governed, and admin apply stays controlled and review-gated.
 */

import type { CompetitiveRoadmapPhase } from './executiveStrategyTypes';

const NO_FINAL_CREDIT = 'No final credit approval / decline automation.';
const NO_LIVE_INTEGRATION = 'No live external integration enabled by default.';
const NO_SCHEMA_MUTATION = 'No UI-driven schema mutation; schema stays operator-script governed.';
const NO_APPLY = 'No unreviewed admin configuration apply.';

const ROADMAP: readonly CompetitiveRoadmapPhase[] = [
  { phaseId: '142I', title: 'Executive-safe route mounting for competitive / product strategy surfaces', purpose: 'Mount the read-only strategy surfaces behind permission-before-render, no operational controls.', riskClass: 'read_only_strategy', prerequisites: ['142H strategy surface'], expectedDeliverables: ['Permission-gated read-only route mounting'], forbiddenActions: [NO_FINAL_CREDIT, NO_LIVE_INTEGRATION], readinessCriteria: ['Permission-before-render verified', 'No write controls'] },
  { phaseId: '142J', title: 'Admin configuration persistence adapter, disabled by default', purpose: 'Model a persistence seam for review-only proposals; disabled by default.', riskClass: 'runtime_write_disabled', prerequisites: ['142G review queue'], expectedDeliverables: ['Disabled persistence adapter seam'], forbiddenActions: [NO_APPLY, NO_SCHEMA_MUTATION], readinessCriteria: ['Adapter disabled by default', 'No live write'] },
  { phaseId: '142K', title: 'Admin configuration controlled apply workflow, no schema mutation', purpose: 'Controlled, review-gated apply workflow for safe metadata proposals only.', riskClass: 'runtime_write_disabled', prerequisites: ['142J persistence adapter'], expectedDeliverables: ['Review-gated apply workflow model'], forbiddenActions: [NO_SCHEMA_MUTATION, 'No custom field creation.', 'No route registration.'], readinessCriteria: ['Every apply is review-gated and audited'] },
  { phaseId: '142L', title: 'Integration transport proof-of-concept harness, fake transport only', purpose: 'Prove the adapter seam with a fake transport; no real provider call.', riskClass: 'external_integration_disabled', prerequisites: ['142F integration registry'], expectedDeliverables: ['Fake-transport test harness'], forbiddenActions: [NO_LIVE_INTEGRATION, 'No PII transmission.'], readinessCriteria: ['Only fake transport', 'No real provider call'] },
  { phaseId: '142M', title: 'Credit committee package review queue, no voting', purpose: 'A review queue for committee packages; findings only, no voting.', riskClass: 'credit_decision_support', prerequisites: ['142C routing', '142D templates'], expectedDeliverables: ['Committee package review queue'], forbiddenActions: [NO_FINAL_CREDIT, 'No voting or approval.'], readinessCriteria: ['Findings only', 'No final decision'] },
  { phaseId: '142N', title: 'Live package export adapter seam, disabled by default', purpose: 'Model a package export seam; disabled by default.', riskClass: 'runtime_write_disabled', prerequisites: ['141P packages'], expectedDeliverables: ['Disabled export adapter seam'], forbiddenActions: ['No final export enabled by default.'], readinessCriteria: ['Export stays draft-only', 'Seam disabled'] },
  { phaseId: '142O', title: 'E-sign envelope adapter seam, disabled by default', purpose: 'Model an e-sign envelope seam; no envelope is sent.', riskClass: 'external_integration_disabled', prerequisites: ['142F integration registry'], expectedDeliverables: ['Disabled e-sign adapter seam'], forbiddenActions: [NO_LIVE_INTEGRATION, 'No envelope send.'], readinessCriteria: ['No send', 'Seam disabled'] },
  { phaseId: '142P', title: 'Core banking read-only lookup adapter, disabled by default', purpose: 'Model a read-only core lookup adapter; disabled by default.', riskClass: 'external_integration_disabled', prerequisites: ['142F integration registry'], expectedDeliverables: ['Disabled read-only core adapter seam'], forbiddenActions: [NO_LIVE_INTEGRATION, 'No core write.'], readinessCriteria: ['Read-only', 'Seam disabled'] },
  { phaseId: '142Q', title: 'AML/KYC and credit bureau policy gate, no live pull', purpose: 'A policy gate for AML/KYC and bureau; no live screening or pull.', riskClass: 'external_integration_disabled', prerequisites: ['142F integration registry'], expectedDeliverables: ['Policy gate model'], forbiddenActions: [NO_LIVE_INTEGRATION, 'No credit pull.', 'No AML run.'], readinessCriteria: ['Permissible purpose required', 'No live pull'] },
  { phaseId: '142R', title: 'Servicing lifecycle read-only Dataverse mapper', purpose: 'A read-only mapper for the servicing lifecycle; posts no transactions.', riskClass: 'runtime_read', prerequisites: ['142E servicing model'], expectedDeliverables: ['Read-only servicing mapper'], forbiddenActions: ['No payment posting.', 'No money movement.'], readinessCriteria: ['Read-only', 'No transaction'] },
  { phaseId: '142S', title: 'Executive product profitability / ROE availability model', purpose: 'Model whether profitability / ROE analytics are available; no fabricated figures.', riskClass: 'runtime_read', prerequisites: ['142H strategy surface'], expectedDeliverables: ['Profitability/ROE availability model'], forbiddenActions: ['No fabricated financial figures.'], readinessCriteria: ['Missing data stays missing'] },
  { phaseId: '142T', title: 'Release readiness certification for platform convergence stack', purpose: 'Certify release readiness across the 142A-S convergence stack.', riskClass: 'read_only_strategy', prerequisites: ['142A-142S'], expectedDeliverables: ['Release readiness certification model'], forbiddenActions: [NO_FINAL_CREDIT, NO_LIVE_INTEGRATION, NO_SCHEMA_MUTATION], readinessCriteria: ['All governance gates green'] },
];

export function deriveCompetitiveRoadmap(): readonly CompetitiveRoadmapPhase[] {
  return ROADMAP;
}
