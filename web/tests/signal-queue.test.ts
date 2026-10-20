import { expect, it } from 'vitest';
import { createSignalEventQueue } from '../src/signalQueue';
import type { RemoteSignalGatewayEvent } from '../src/upstream/types';

function event(id: number, type: 'answer' | 'candidate' = 'answer'): RemoteSignalGatewayEvent {
  return { id, direction: 'inbound', event: 'soac', payload: { data: { type } }, receivedAt: 'fixture-time' };
}
async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve();
}

it('applies the new connection answer while the disconnected connection apply never settles', async () => {
  let current = 'old';
  const applied: number[] = [];
  const oldQueue = createSignalEventQueue(() => current === 'old', async value => {
    applied.push(value.id);
    await new Promise<void>(() => {});
  }, () => { throw new Error('unexpected old connection error'); });
  void oldQueue(event(1));
  await flush();
  expect(applied).toEqual([1]);

  current = 'new';
  const newQueue = createSignalEventQueue(() => current === 'new', async value => { applied.push(value.id); }, () => {
    throw new Error('unexpected new connection error');
  });
  void newQueue(event(2));
  await flush();
  expect(applied).toEqual([1, 2]);
});

it('preserves answer and candidate order within one connection', async () => {
  let finishAnswer!: () => void;
  const applied: number[] = [];
  const queue = createSignalEventQueue(() => true, async value => {
    applied.push(value.id);
    if (value.id === 1) await new Promise<void>(resolve => { finishAnswer = resolve; });
  }, () => { throw new Error('unexpected apply error'); });
  const answer = queue(event(1));
  const candidate = queue(event(2, 'candidate'));
  await flush();
  expect(applied).toEqual([1]);
  finishAnswer();
  await Promise.all([answer, candidate]);
  expect(applied).toEqual([1, 2]);
});

it('ignores queued old events and a late old apply failure after a replacement connection starts', async () => {
  let current = 'old', rejectOld!: (error: Error) => void;
  const applied: number[] = [], failures: string[] = [];
  const oldQueue = createSignalEventQueue(() => current === 'old', async value => {
    applied.push(value.id);
    await new Promise<void>((_resolve, reject) => { rejectOld = reject; });
  }, () => { failures.push('old'); current = ''; });
  const oldApply = oldQueue(event(1));
  const oldQueued = oldQueue(event(2, 'candidate'));
  await flush();

  current = 'new';
  const newQueue = createSignalEventQueue(() => current === 'new', async value => { applied.push(value.id); }, () => {
    failures.push('new'); current = '';
  });
  void newQueue(event(3));
  await flush();
  expect(applied).toEqual([1, 3]);
  rejectOld(new Error('closed previous peer'));
  await Promise.all([oldApply, oldQueued]);
  await newQueue(event(4, 'candidate'));
  expect(applied).toEqual([1, 3, 4]);
  expect(failures).toEqual([]);
  expect(current).toBe('new');
});

it('reports a current apply failure and skips remaining events once that connection closes', async () => {
  let current = true, failures = 0;
  const applied: number[] = [];
  const queue = createSignalEventQueue(() => current, async value => {
    applied.push(value.id);
    throw new Error('invalid current answer');
  }, () => { failures++; current = false; });
  await Promise.all([queue(event(1)), queue(event(2, 'candidate'))]);
  expect(applied).toEqual([1]);
  expect(failures).toBe(1);
});
