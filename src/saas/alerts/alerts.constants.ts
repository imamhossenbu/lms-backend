/** Owner Console alerts ("needs attention") — same thresholds as the console's attentionItems(). */

export const ALERT_KINDS = ["PAST_DUE", "TRIAL_ENDING", "NEAR_LIMIT", "DOMAIN_FAILED"] as const;

/** Trials ending within this many days raise an alert. */
export const TRIAL_ENDING_DAYS = 3;
/** Plan-limit usage % that raises an alert. */
export const NEAR_LIMIT_PCT = 90;
/** Max ids per mark-read / mark-unread call. */
export const MAX_ALERT_IDS = 500;
export const ALERT_ID_REGEX = /^[0-9a-f-]{36}-(trial|pastdue|limit|domain)$/i;
