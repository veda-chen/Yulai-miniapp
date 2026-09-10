import { describe, expect, it } from "vitest";
import { generateBalancedMatches, teamForUser, validateBadmintonScore } from "./live-domain.js";

describe("live domain", () => {
  it("creates doubles matches without duplicate players and favors fewer games", () => {
    const matches = generateBalancedMatches(
      [
        { userId: "u1", level: "COMPETITIVE", gamesPlayed: 0 },
        { userId: "u2", level: "IMPROVING", gamesPlayed: 0 },
        { userId: "u3", level: "BEGINNER", gamesPlayed: 0 },
        { userId: "u4", level: "CASUAL", gamesPlayed: 0 },
        { userId: "u5", level: "IMPROVING", gamesPlayed: 1 },
      ],
      1,
      "round-1",
    );
    const firstMatch = matches[0];
    expect(firstMatch).toBeDefined();
    if (!firstMatch) return;
    const players = [...firstMatch.teamAUserIds, ...firstMatch.teamBUserIds];
    expect(new Set(players).size).toBe(4);
    expect(players).not.toContain("u5");
  });

  it("accepts valid badminton scores and rejects unfinished scores", () => {
    expect(() => validateBadmintonScore(21, 19)).not.toThrow();
    expect(() => validateBadmintonScore(30, 29)).not.toThrow();
    expect(() => validateBadmintonScore(21, 20)).toThrow();
  });

  it("identifies the player's team", () => {
    expect(teamForUser("u2", ["u1", "u2"], ["u3", "u4"])).toBe("A");
    expect(teamForUser("u5", ["u1", "u2"], ["u3", "u4"])).toBeNull();
  });
});
