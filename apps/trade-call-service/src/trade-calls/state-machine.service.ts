import { Injectable } from '@nestjs/common';
import { TradeCallStatus } from '@cai/types';

type TransitionMap = Map<TradeCallStatus, Set<TradeCallStatus>>;

/**
 * Encapsulates the valid state transitions for a TradeCall's lifecycle.
 *
 *  PENDING         → ACTIVE | NEEDS_REVIEW | REJECTED
 *  ACTIVE          → PARTIALLY_CLOSED | CLOSED_SL | CLOSED_SL_BREAKEVEN | EXPIRED | MANUALLY_CLOSED
 *  PARTIALLY_CLOSED→ PARTIALLY_CLOSED | COMPLETED_ALL_TARGETS | CLOSED_SL_AFTER_TP | MANUALLY_CLOSED
 *
 * Terminal states (no outgoing transitions):
 *  COMPLETED_ALL_TARGETS, CLOSED_SL, CLOSED_SL_BREAKEVEN, CLOSED_SL_AFTER_TP,
 *  EXPIRED, MANUALLY_CLOSED, REJECTED, NEEDS_REVIEW
 */
@Injectable()
export class StateMachineService {
  private readonly transitions: TransitionMap = new Map<TradeCallStatus, Set<TradeCallStatus>>([
    [
      TradeCallStatus.PENDING,
      new Set([
        TradeCallStatus.ACTIVE,
        TradeCallStatus.NEEDS_REVIEW,
        TradeCallStatus.REJECTED,
      ]),
    ],
    [
      TradeCallStatus.ACTIVE,
      new Set([
        TradeCallStatus.PARTIALLY_CLOSED,
        TradeCallStatus.CLOSED_SL,
        TradeCallStatus.CLOSED_SL_BREAKEVEN,
        TradeCallStatus.EXPIRED,
        TradeCallStatus.MANUALLY_CLOSED,
      ]),
    ],
    [
      TradeCallStatus.PARTIALLY_CLOSED,
      new Set([
        TradeCallStatus.PARTIALLY_CLOSED,
        TradeCallStatus.COMPLETED_ALL_TARGETS,
        TradeCallStatus.CLOSED_SL_AFTER_TP,
        TradeCallStatus.MANUALLY_CLOSED,
      ]),
    ],
  ]);

  /**
   * Returns true if transitioning from `from` to `to` is a valid state machine step.
   */
  canTransition(from: TradeCallStatus, to: TradeCallStatus): boolean {
    const allowed = this.transitions.get(from);
    if (!allowed) {
      return false;
    }
    return allowed.has(to);
  }

  /**
   * Given the current status, a target index that was just hit, and the total
   * number of targets, returns the appropriate next status.
   *
   * - If tpIndex + 1 equals totalTargets, all targets are hit → COMPLETED_ALL_TARGETS
   * - Otherwise the call is partially closed → PARTIALLY_CLOSED
   * - Falls back to current status when the current state is not a recognized
   *   origin for target-hit transitions.
   */
  getNextStatusOnTpHit(
    current: TradeCallStatus,
    tpIndex: number,
    totalTargets: number,
  ): TradeCallStatus {
    const isLastTarget = tpIndex + 1 >= totalTargets;

    if (isLastTarget) {
      return TradeCallStatus.COMPLETED_ALL_TARGETS;
    }

    if (
      current === TradeCallStatus.ACTIVE ||
      current === TradeCallStatus.PARTIALLY_CLOSED
    ) {
      return TradeCallStatus.PARTIALLY_CLOSED;
    }

    // Return current if the transition is not applicable
    return current;
  }

  /**
   * Returns the list of allowed next statuses from a given state.
   */
  getAllowedTransitions(from: TradeCallStatus): TradeCallStatus[] {
    const allowed = this.transitions.get(from);
    return allowed ? Array.from(allowed) : [];
  }
}
