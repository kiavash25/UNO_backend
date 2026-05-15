export const redisKeys = {
  roomByCode: (code: string) => `uno:roomCode:${code}`,
  liveRoom: (roomId: string) => `uno:live:${roomId}`,
  session: (token: string) => `uno:session:${token}`,
  publicLobbyRooms: () => "uno:publicLobbyRooms",
};
