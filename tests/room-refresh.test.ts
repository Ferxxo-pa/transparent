import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canApplyRoomRefresh } from '../src/lib/roomRefresh.ts';

const base = {
  requestGameId: 'room-a',
  requestGen: 1,
  currentGameId: 'room-a',
  currentGen: 1,
  previousGameId: 'room-a',
};

test('applies a refresh that still belongs to the same room', () => {
  assert.equal(canApplyRoomRefresh(base), true);
});

test('drops a refresh after the player opens a new room', () => {
  assert.equal(canApplyRoomRefresh({ ...base, currentGameId: 'room-b', currentGen: 2, previousGameId: 'room-b' }), false);
  assert.equal(canApplyRoomRefresh({ ...base, previousGameId: 'room-b' }), false);
});

test('drops a refresh after the room generation moves on, even for the same id', () => {
  assert.equal(canApplyRoomRefresh({ ...base, currentGen: 2 }), false);
});

test('does not recreate a room that was cleared', () => {
  assert.equal(canApplyRoomRefresh({ ...base, currentGameId: null, previousGameId: null }), false);
});
