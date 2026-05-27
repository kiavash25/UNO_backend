export const redisKeys = {
  roomByCode: (code: string) => `cardhub:roomCode:${code}`,
  liveRoom: (roomId: string) => `cardhub:live:${roomId}`,
  session: (token: string) => `cardhub:session:${token}`,
  publicLobbyRooms: () => "cardhub:publicLobbyRooms",
  gameAnalyticsMeta: (roomId: string) => `cardhub:analytics:game:${roomId}:meta`,
  gameAnalyticsEvents: (roomId: string) => `cardhub:analytics:game:${roomId}:events`,
};

export const legacyUnoRedisKeys = {
  roomByCode: (code: string) => `uno:roomCode:${code}`,
  liveRoom: (roomId: string) => `uno:live:${roomId}`,
  session: (token: string) => `uno:session:${token}`,
  publicLobbyRooms: () => "uno:publicLobbyRooms",
};
