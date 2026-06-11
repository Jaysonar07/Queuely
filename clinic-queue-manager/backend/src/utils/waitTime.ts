/**
 * Estimated Wait Time (EWT) Calculator
 * Ported from frontend for server-side analytics / API use.
 */

import { ConsultationHistory } from '../types/index.js';

export interface EWTResult {
  minutes: number;
  calculationMethod: 'EMA' | 'Manual Fallback' | 'Zero Queue';
  sampleCount: number;
  calculatedAvgSeconds: number;
}

export function calculateEWT(
  queueLength: number,
  history: ConsultationHistory[],
  manualOverrideMinutes: number,
  options: {
    smoothingWindow?: number;
    allowSandboxFastTesting?: boolean;
  } = {}
): EWTResult {
  const { smoothingWindow = 10, allowSandboxFastTesting = false } = options;

  if (queueLength <= 0) {
    return {
      minutes: 0,
      calculationMethod: 'Zero Queue',
      sampleCount: history.length,
      calculatedAvgSeconds: 0,
    };
  }

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

  const sampleCount = filteredHistory.length;
  const alpha = 2.0 / (smoothingWindow + 1);
  let avgConsultationSeconds = manualOverrideMinutes * 60;
  let calculationMethod: 'EMA' | 'Manual Fallback' = 'Manual Fallback';

  if (sampleCount >= 2) {
    calculationMethod = 'EMA';
    let currentEMA = manualOverrideMinutes * 60;
    for (const record of filteredHistory) {
      currentEMA = alpha * record.durationSeconds + (1.0 - alpha) * currentEMA;
    }
    avgConsultationSeconds = currentEMA;
  }

  const rawEstimateSeconds = queueLength * avgConsultationSeconds;
  const minSecondsPerPerson = allowSandboxFastTesting ? 30 : 180;
  const maxSecondsPerPerson = 2700;
  const minLimitSeconds = queueLength * minSecondsPerPerson;
  const maxLimitSeconds = queueLength * maxSecondsPerPerson;
  const boundedSeconds = Math.max(minLimitSeconds, Math.min(maxLimitSeconds, rawEstimateSeconds));
  const finalMinutes = Math.round(boundedSeconds / 60);

  return {
    minutes: Math.max(1, finalMinutes),
    calculationMethod,
    sampleCount,
    calculatedAvgSeconds: Math.round(avgConsultationSeconds),
  };
}
