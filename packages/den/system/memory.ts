// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

/**
 * Returns true if we have hit the limit of the JS heap size.
 */
export function isMemoryExhausted(fraction: number = 0.85): boolean {
  if (performance.memory) {
    return performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit > fraction;
  } else {
    return false;
  }
}
