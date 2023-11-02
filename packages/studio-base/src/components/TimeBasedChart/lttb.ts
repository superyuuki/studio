// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as R from "ramda";

type Point = [x: number, y: number];
type IndexedPoint = [index: number, point: Point];

const containsNaN = ([, [x, y]]: IndexedPoint): boolean => isNaN(x) || isNaN(y);

/**
 * Choose a subset of points from the provided dataset that retain its visual properties. The output of this algorithm is only well-defined for datasets where the x-axis is sorted and is plotted as a contiguous line.
 *
 * This is an implementation of the "Largest Triangle Three Buckets" algorithm as it appears in Sveinn Steinarsson's 2013 master's thesis of the same name.
 * More information and other implementations: https://github.com/sveinn-steinarsson/flot-downsample
 * The thesis: http://hdl.handle.net/1946/15343
 * Some insight derived from this native JavaScript implementation (license MIT): https://github.com/joshcarr/largest-triangle-three-buckets.js/blob/master/lib/largest-triangle-three-buckets.js
 */
export function downsampleLTTB(
  get: (index: number) => Point | undefined,
  numPoints: number,
  numBuckets: number,
): number[] | undefined {
  if (numBuckets >= numPoints || numBuckets === 0) {
    return R.range(0, numPoints);
  }

  const bucketSize = (numPoints - 2) / (numBuckets - 2);

  const getBucket = (index: number): [start: number, end: number] => [
    Math.floor(index * bucketSize),
    Math.floor((index + 1) * bucketSize),
  ];

  const getPoints = (start: number, end: number): IndexedPoint[] | undefined => {
    const points: IndexedPoint[] = [];
    for (const index of R.range(start, end)) {
      const point = get(index);
      if (point == undefined) {
        return undefined;
      }
      points.push([index, point]);
    }

    return points;
  };

  let next: number = 0;
  let points: number[] = [0];
  for (const bucketIndex of R.range(0, numBuckets - 2)) {
    const [bucketStart, bucketEnd] = getBucket(bucketIndex);
    // First, get all of the points for this bucket so we can check for
    // nullity and/or NaN
    const bucketPoints = getPoints(bucketStart, bucketEnd);
    if (bucketPoints == undefined) {
      return undefined;
    }

    // Next, get the average of the following bucket
    const [nextStart, nextEnd] = getBucket(bucketIndex + 1);
    const nextPoints = getPoints(nextStart, Math.min(nextEnd, numPoints));
    if (nextPoints == undefined) {
      return undefined;
    }

    // Check all points under consideration for NaN. We use NaN to imply a
    // break in the plot; this has to be given special treatment so that we
    // downsample both parts of the plot separately.
    const nanPoint = R.find(containsNaN, [...bucketPoints, ...nextPoints]);
    if (nanPoint != undefined) {
      const [nanIndex] = nanPoint;

      // Attempt to add the last point before the NaN
      if (nanIndex - 1 >= bucketStart) {
        points.push(nanIndex - 1);
      }

      // If NaN comes at the very end, there's no point in continuing
      const remainingPoints = numPoints - (nanIndex + 1);
      if (remainingPoints <= 0) {
        return points;
      }

      // Downsample the rest of the dataset separately
      const rest = downsampleLTTB(
        (index) => get(index + nanIndex + 1),
        remainingPoints,
        numBuckets - bucketIndex,
      );
      if (rest == undefined) {
        return undefined;
      }

      return points.concat(rest);
    }

    const avgX = R.sum(nextPoints.map(([, [x]]) => x)) / nextPoints.length;
    const avgY = R.sum(nextPoints.map(([, [, y]]) => y)) / nextPoints.length;
    const a = get(next);
    if (a == undefined) {
      return undefined;
    }
    const [aX, aY] = a;

    // Choose the triangle with the maximum area
    let maxIndex = -1;
    let maxArea = 0;
    for (const [index, [x, y]] of bucketPoints) {
      const area = Math.abs((aX - avgX) * (y - aY) - (aX - x) * (avgY - aY)) * 0.5;
      if (area < maxArea) {
        continue;
      }
      maxArea = area;
      maxIndex = index;
    }

    if (maxIndex === -1) {
      return undefined;
    }

    points.push(maxIndex);
    next = maxIndex;
  }

  points.push(numPoints - 1);
  return points;
}
