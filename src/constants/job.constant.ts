// Time in minutes before giving up on polling a job
export const MAX_POLLING_TIME_MINUTES = 15;
// Time in milliseconds
export const MAX_POLLING_TIME_MS = MAX_POLLING_TIME_MINUTES * 60 * 1000;

// Queue Configuration
export const MAX_CONCURRENT_JOBS = 3;
export const JOB_TIMEOUT_MINUTES = MAX_POLLING_TIME_MINUTES; // Strict timeout for processing steps
