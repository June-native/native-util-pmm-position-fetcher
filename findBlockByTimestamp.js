function toNumber(value) {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  return Number(value);
}

function formatTs(unixSeconds) {
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Find the highest block whose timestamp is <= targetTimestamp.
 *
 * Uses interpolation-assisted binary search over eth_getBlockByNumber so it
 * works on every EVM chain without explorer APIs. Missing/pruned early blocks
 * (common on newer chains) are skipped instead of requiring genesis.
 *
 * @param {import('ethers').Provider} provider
 * @param {number} targetTimestamp Unix timestamp in seconds
 * @param {{ log?: (message: string) => void }} [options]
 * @returns {Promise<{ number: number, timestamp: number }>}
 */
export async function findBlockByTimestamp(provider, targetTimestamp, options = {}) {
  const log = typeof options.log === 'function' ? options.log : () => {};
  const target = Number(targetTimestamp);

  if (!Number.isFinite(target) || target < 0) {
    throw new Error('Invalid timestamp');
  }

  const latest = await provider.getBlock('latest');
  if (!latest) {
    throw new Error('Failed to fetch latest block');
  }

  const latestNumber = toNumber(latest.number);
  const latestTs = toNumber(latest.timestamp);

  if (target >= latestTs) {
    log(`Target time is at or after latest block ${latestNumber}; using latest`);
    return { number: latestNumber, timestamp: latestTs };
  }

  let low = 0;
  let high = latestNumber;
  let lowTs = 0;
  let highTs = latestTs;

  const cache = new Map([
    [latestNumber, latest]
  ]);

  const getCached = async (blockNumber) => {
    if (cache.has(blockNumber)) {
      return cache.get(blockNumber);
    }
    const block = await provider.getBlock(blockNumber);
    if (block) {
      cache.set(blockNumber, block);
    }
    return block;
  };

  while (low < high) {
    const span = high - low;
    const tsSpan = highTs - lowTs;
    let mid;

    if (lowTs > 0 && tsSpan > 0 && span > 1) {
      const ratio = (target - lowTs) / tsSpan;
      mid = Math.floor(low + ratio * span);
    } else {
      mid = Math.floor((low + high + 1) / 2);
    }

    // Keep mid in (low, high] so each step always shrinks the range
    mid = Math.max(low + 1, Math.min(high, mid));

    let block = await getCached(mid);
    if (!block) {
      // Pruned or unavailable: earliest readable history is above this mid
      log(`Block ${mid} unavailable; searching higher`);
      low = mid;
      continue;
    }

    const midTs = toNumber(block.timestamp);
    log(`Checking block ${mid} @ ${formatTs(midTs)}`);

    if (midTs <= target) {
      low = mid;
      lowTs = midTs;
    } else {
      const below = mid > 0 ? await getCached(mid - 1) : null;
      if (!below) {
        throw new Error(
          `Time is before the earliest available block (block ${mid} at ${formatTs(midTs)})`
        );
      }
      high = mid - 1;
      highTs = toNumber(below.timestamp);
    }
  }

  const result = await getCached(low);
  if (!result) {
    throw new Error('Failed to resolve a block at the target time (history may be pruned)');
  }

  const resultTs = toNumber(result.timestamp);
  if (resultTs > target) {
    throw new Error(
      `Time is before the earliest available block (block ${low} at ${formatTs(resultTs)})`
    );
  }

  return {
    number: low,
    timestamp: resultTs
  };
}
