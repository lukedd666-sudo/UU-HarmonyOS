import type { RemoteSignalGatewayEvent } from './upstream/types';

export function createSignalEventQueue(
  isCurrent: () => boolean,
  apply: (event: RemoteSignalGatewayEvent) => Promise<void> | undefined,
  onError: () => void,
): (event: RemoteSignalGatewayEvent) => Promise<void> {
  // A closed peer may leave apply pending; the next connection must own a fresh chain.
  let queue: Promise<void> = Promise.resolve();
  return event => {
    queue = queue.then(async () => { if (isCurrent()) await apply(event); }).catch(() => {
      if (isCurrent()) onError();
    });
    return queue;
  };
}
