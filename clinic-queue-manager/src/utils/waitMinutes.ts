/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConsultationHistory } from '../types';

/**
 * Calculates the Estimated Wait Time (EWT) in minutes using an Exponential Moving Average (EMA).
 * 
 * @param queueLength Number of patients waiting ahead of the target patient
 * @param history Completed consultation records
 * @param manualOverrideMinutes Receptionist override configuration value
 * @param options Calibration overrides
 * @returns Bounded estimate rounded to the nearest minute
 */
export function calculateEWT(
  queueLength: number,
  history: ConsultationHistory[],
  manualOverrideMinutes: number,
  options: {
    smoothingWindow?: number;
    allowSandboxFastTesting?: boolean;
  } = {}
): {
  minutes: number;
  calculationMethod: 'EMA' | 'Manual Fallback' | 'Zero Queue';
  sampleCount: number;
  calculatedAvgSeconds: number;
} {
  const { smoothingWindow = 10, allowSandboxFastTesting = true } = options;

  if (queueLength <= 0) {
    return {
      minutes: 0,
      calculationMethod: 'Zero Queue',
      sampleCount: history.length,
      calculatedAvgSeconds: 0
    };
  }

  // 1. Filter out outliers
  // Standard outlier floor is 90 seconds. We adjust this to 10 seconds for sandbox testing 
  // so the user can complete consultations rapidly and see the algorithm update.
  const outlierFloorSeconds = allowSandboxFastTesting ? 10 : 90;
  
  const durations = history.map((h) => h.durationSeconds);
  let filteredHistory = history;

  if (durations.length >= 3) {
    const sortedDurations = [...durations].sort((a, b) => a - b);
    const mid = Math.floor(sortedDurations.length / 2);
    const median = sortedDurations.length % 2 !== 0 
      ? sortedDurations[mid] 
      : (sortedDurations[mid - 1] + sortedDurations[mid]) / 2;
    
    const outlierCeilingSeconds = median * 3;

    filteredHistory = history.filter(
      (h) => h.durationSeconds >= outlierFloorSeconds && h.durationSeconds <= outlierCeilingSeconds
    );
  }

  // Let's check how many samples we have after filtering
  const sampleCount = filteredHistory.length;
  const alpha = 2.0 / (smoothingWindow + 1); // 2 / (10 + 1) = 0.1818

  let avgConsultationSeconds = manualOverrideMinutes * 60;
  let calculationMethod: 'EMA' | 'Manual Fallback' = 'Manual Fallback';

  if (sampleCount >= 2) { // Allow starting EMA early if we have at least 2 filtered samples
    calculationMethod = 'EMA';
    // Initial core is the manual override converted to seconds
    let currentEMA = manualOverrideMinutes * 60;

    // Apply the EMA formula sequentially across samples
    for (const record of filteredHistory) {
      currentEMA = (alpha * record.durationSeconds) + ((1.0 - alpha) * currentEMA);
    }
    avgConsultationSeconds = currentEMA;
  } else {
    calculationMethod = 'Manual Fallback';
  }

  // 3. Compute raw estimated wait time
  const rawEstimateSeconds = queueLength * avgConsultationSeconds;

  // 4. Apply safety limits (min 3 mins / max 45 mins per person ahead, scaled to seconds)
  // For sandbox testing, if fast testing is enabled, we relax the lower bound 
  // so the EWT can show fine-grained seconds or smaller values like 0.5-3 minutes.
  const minSecondsPerPerson = allowSandboxFastTesting ? 30 : 180; // 30s vs 3m
  const maxSecondsPerPerson = 2700; // 45m

  const minLimitSeconds = queueLength * minSecondsPerPerson;
  const maxLimitSeconds = queueLength * maxSecondsPerPerson;

  const boundedSeconds = Math.max(
    minLimitSeconds,
    Math.min(maxLimitSeconds, rawEstimateSeconds)
  );

  // Convert back to minutes
  const finalMinutes = Math.round(boundedSeconds / 60);

  return {
    minutes: Math.max(1, finalMinutes), // Keep minimum estimate at 1 minute if queue exists
    calculationMethod,
    sampleCount,
    calculatedAvgSeconds: Math.round(avgConsultationSeconds)
  };
}
