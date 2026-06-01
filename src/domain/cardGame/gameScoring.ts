export type GameReward = {
  xp: number;
  coins: number;
};

export type RankedRewardTable = {
  ranks: Record<number, GameReward>;
  rest: GameReward;
};

export type GameScoringRules = {
  private: RankedRewardTable;
  public: Record<number, RankedRewardTable>;
};

export const gameScoringRules: Record<string, GameScoringRules> = {
  exploding_kittens: {
    private: {
      ranks: {
        1: { xp: 120, coins: 50 },
        2: { xp: 60, coins: 25 },
        3: { xp: 35, coins: 15 },
      },
      rest: { xp: 20, coins: 10 },
    },
    public: {
      2: {
        ranks: {
          1: { xp: 90, coins: 35 },
          2: { xp: 20, coins: 8 },
        },
        rest: { xp: 20, coins: 8 },
      },
      3: {
        ranks: {
          1: { xp: 120, coins: 50 },
          2: { xp: 55, coins: 22 },
          3: { xp: 25, coins: 10 },
        },
        rest: { xp: 25, coins: 10 },
      },
      4: {
        ranks: {
          1: { xp: 150, coins: 65 },
          2: { xp: 75, coins: 32 },
          3: { xp: 40, coins: 18 },
        },
        rest: { xp: 20, coins: 8 },
      },
      5: {
        ranks: {
          1: { xp: 180, coins: 80 },
          2: { xp: 95, coins: 42 },
          3: { xp: 55, coins: 24 },
        },
        rest: { xp: 25, coins: 10 },
      },
    },
  },
  uno: {
    private: {
      ranks: {
        1: { xp: 120, coins: 50 },
        2: { xp: 60, coins: 25 },
        3: { xp: 35, coins: 15 },
      },
      rest: { xp: 20, coins: 10 },
    },
    public: {
      2: {
        ranks: {
          1: { xp: 90, coins: 35 },
          2: { xp: 20, coins: 8 },
        },
        rest: { xp: 20, coins: 8 },
      },
      3: {
        ranks: {
          1: { xp: 120, coins: 50 },
          2: { xp: 55, coins: 22 },
          3: { xp: 25, coins: 10 },
        },
        rest: { xp: 25, coins: 10 },
      },
      4: {
        ranks: {
          1: { xp: 150, coins: 65 },
          2: { xp: 75, coins: 32 },
          3: { xp: 40, coins: 18 },
        },
        rest: { xp: 20, coins: 8 },
      },
      5: {
        ranks: {
          1: { xp: 180, coins: 80 },
          2: { xp: 95, coins: 42 },
          3: { xp: 55, coins: 24 },
        },
        rest: { xp: 25, coins: 10 },
      },
      6: {
        ranks: {
          1: { xp: 210, coins: 95 },
          2: { xp: 115, coins: 52 },
          3: { xp: 70, coins: 30 },
        },
        rest: { xp: 30, coins: 12 },
      },
      7: {
        ranks: {
          1: { xp: 240, coins: 110 },
          2: { xp: 135, coins: 62 },
          3: { xp: 85, coins: 36 },
        },
        rest: { xp: 35, coins: 14 },
      },
      8: {
        ranks: {
          1: { xp: 270, coins: 125 },
          2: { xp: 155, coins: 72 },
          3: { xp: 100, coins: 42 },
        },
        rest: { xp: 40, coins: 16 },
      },
      9: {
        ranks: {
          1: { xp: 300, coins: 140 },
          2: { xp: 175, coins: 82 },
          3: { xp: 115, coins: 48 },
        },
        rest: { xp: 45, coins: 18 },
      },
      10: {
        ranks: {
          1: { xp: 330, coins: 155 },
          2: { xp: 195, coins: 92 },
          3: { xp: 130, coins: 54 },
        },
        rest: { xp: 50, coins: 20 },
      },
    },
  },
};

export function getRankReward(
  gameId: string,
  rank: number,
  totalPlayers: number,
  isPrivate: boolean,
): GameReward {
  const fallbackRules = gameScoringRules.uno as GameScoringRules;
  const rules = gameScoringRules[gameId] ?? fallbackRules;
  const playerCount = Math.max(2, Math.min(10, Math.round(totalPlayers)));
  const table = isPrivate
    ? rules.private
    : (rules.public[playerCount] ?? rules.public[4] ?? fallbackRules.private);

  return table.ranks[rank] ?? table.rest;
}
