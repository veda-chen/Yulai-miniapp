import { describe, expect, it } from "vitest";
import {
  joinParticipation,
  leaveParticipation,
  type ParticipationState,
} from "./registration-domain.js";

function emptyState(capacity: number): ParticipationState {
  return { capacity, confirmedUserIds: [], waitlistUserIds: [], nextQueueNo: 1 };
}

describe("registration capacity and waitlist", () => {
  it("never exceeds capacity and preserves order across 100 joins", () => {
    let state = emptyState(12);
    for (let index = 1; index <= 100; index += 1) {
      state = joinParticipation(state, `user-${index}`).state;
    }

    expect(state.confirmedUserIds).toEqual(
      Array.from({ length: 12 }, (_, index) => `user-${index + 1}`),
    );
    expect(state.waitlistUserIds).toHaveLength(88);
    expect(state.waitlistUserIds[0]).toBe("user-13");
  });

  it("does not consume another place on a duplicate join", () => {
    const first = joinParticipation(emptyState(1), "user-1");
    const duplicate = joinParticipation(first.state, "user-1");

    expect(duplicate.changed).toBe(false);
    expect(duplicate.status).toBe("CONFIRMED");
    expect(duplicate.state.confirmedUserIds).toEqual(["user-1"]);
    expect(duplicate.state.nextQueueNo).toBe(2);
  });

  it("promotes the first waitlisted user before the deadline", () => {
    let state = emptyState(1);
    state = joinParticipation(state, "confirmed").state;
    state = joinParticipation(state, "waiting-1").state;
    state = joinParticipation(state, "waiting-2").state;

    const result = leaveParticipation(state, "confirmed", true);
    expect(result.promotedUserId).toBe("waiting-1");
    expect(result.state.confirmedUserIds).toEqual(["waiting-1"]);
    expect(result.state.waitlistUserIds).toEqual(["waiting-2"]);
  });

  it("does not promote a waitlisted user after the deadline", () => {
    let state = emptyState(1);
    state = joinParticipation(state, "confirmed").state;
    state = joinParticipation(state, "waiting").state;

    const result = leaveParticipation(state, "confirmed", false);
    expect(result.promotedUserId).toBeNull();
    expect(result.state.confirmedUserIds).toEqual([]);
    expect(result.state.waitlistUserIds).toEqual(["waiting"]);
  });

  it("removes a waitlisted user without changing confirmed members", () => {
    let state = emptyState(1);
    state = joinParticipation(state, "confirmed").state;
    state = joinParticipation(state, "waiting-1").state;
    state = joinParticipation(state, "waiting-2").state;

    const result = leaveParticipation(state, "waiting-1", true);
    expect(result.state.confirmedUserIds).toEqual(["confirmed"]);
    expect(result.state.waitlistUserIds).toEqual(["waiting-2"]);
  });
});
