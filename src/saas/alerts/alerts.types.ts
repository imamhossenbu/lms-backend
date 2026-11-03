import type { InstitutionView } from "../saas.types";
import type { ALERT_KINDS } from "./alerts.constants";

export type AlertKind = (typeof ALERT_KINDS)[number];

/** The console's AttentionItem. */
export interface AttentionItem {
  id: string;
  kind: AlertKind;
  institution: InstitutionView;
  title: string;
  detail: string;
  /** Sort weight — lower is more urgent. */
  priority: number;
}

/** AttentionItem + the owner's read-state. */
export interface AlertView extends AttentionItem {
  read: boolean;
  readAt: string | null;
}

export interface AlertSummary {
  /** All current alerts (unfiltered). */
  total: number;
  unread: number;
  /** After status + search (the "All" tab count). */
  searched: number;
  /** Tab counts after status + search. */
  byKind: Record<AlertKind, number>;
}

export interface AlertListQuery {
  kind?: AlertKind;
  status?: "read" | "unread";
  q?: string;
}
