/** A room refresh may update state only when it still belongs to that room. */
export interface RoomRefreshSnapshot {
  requestGameId: string;
  requestGen: number;
  currentGameId: string | null;
  currentGen: number;
  previousGameId: string | null;
}

export function canApplyRoomRefresh(snapshot: RoomRefreshSnapshot): boolean {
  if (!snapshot.requestGameId) return false;
  if (snapshot.currentGameId !== snapshot.requestGameId) return false;
  if (snapshot.currentGen !== snapshot.requestGen) return false;
  if (!snapshot.previousGameId || snapshot.previousGameId !== snapshot.requestGameId) return false;
  return true;
}
