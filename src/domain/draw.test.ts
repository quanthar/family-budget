import assert from 'node:assert/strict';
import test from 'node:test';
import { DrawError, generateDraw } from './draw.js';

function verifyAssignments(
  participantIds: number[],
  exclusions: Array<{ giverId: number; receiverId: number }>,
  assignments: Array<{ giverId: number; receiverId: number }>,
) {
  assert.equal(assignments.length, participantIds.length);
  const givers = new Set(assignments.map((a) => a.giverId));
  const receivers = new Set(assignments.map((a) => a.receiverId));
  assert.equal(givers.size, participantIds.length);
  assert.equal(receivers.size, participantIds.length);

  for (const id of participantIds) {
    assert.ok(givers.has(id));
    assert.ok(receivers.has(id));
  }

  const exSet = new Set(exclusions.map((e) => `${e.giverId}:${e.receiverId}`));
  for (const a of assignments) {
    assert.notEqual(a.giverId, a.receiverId, 'Self-assignment is forbidden');
    assert.ok(!exSet.has(`${a.giverId}:${a.receiverId}`), 'Exclusion violated');
  }
}

test('throws when fewer than 2 participants', () => {
  assert.throws(() => generateDraw([], []), DrawError);
  assert.throws(() => generateDraw([1], []), DrawError);
});

test('works for 2 participants without exclusions', () => {
  const res = generateDraw([1, 2], []);
  verifyAssignments([1, 2], [], res);
});

test('throws for 2 participants when excluded', () => {
  assert.throws(
    () => generateDraw([1, 2], [{ giverId: 1, receiverId: 2 }]),
    DrawError,
  );
});

test('handles couples exclusions for 6 participants across 100 runs', () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const exclusions = [
    { giverId: 1, receiverId: 2 },
    { giverId: 2, receiverId: 1 },
    { giverId: 3, receiverId: 4 },
    { giverId: 4, receiverId: 3 },
    { giverId: 5, receiverId: 6 },
    { giverId: 6, receiverId: 5 },
  ];

  for (let i = 0; i < 100; i++) {
    const res = generateDraw(ids, exclusions);
    verifyAssignments(ids, exclusions, res);
  }
});

test('handles asymmetric exclusions and tight graphs', () => {
  const ids = [10, 20, 30, 40];
  // 10 can only give to 20; 20 can only give to 30
  const exclusions = [
    { giverId: 10, receiverId: 30 },
    { giverId: 10, receiverId: 40 },
    { giverId: 20, receiverId: 10 },
    { giverId: 20, receiverId: 40 },
  ];

  for (let i = 0; i < 30; i++) {
    const res = generateDraw(ids, exclusions);
    verifyAssignments(ids, exclusions, res);
    const map = new Map(res.map((r) => [r.giverId, r.receiverId]));
    assert.equal(map.get(10), 20);
    assert.equal(map.get(20), 30);
  }
});

test('detects impossible matching when two givers share single allowed receiver', () => {
  const ids = [1, 2, 3];
  // Both 1 and 2 can only give to 3
  const exclusions = [
    { giverId: 1, receiverId: 2 },
    { giverId: 2, receiverId: 1 },
  ];
  assert.throws(() => generateDraw(ids, exclusions), DrawError);
});
