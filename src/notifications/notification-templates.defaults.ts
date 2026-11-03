import type { NotificationCategory, NotificationChannel, TemplateTrigger } from "./notifications.types";

/** Placeholders available per automated trigger (subject/body may only use these) — panel TRIGGER_PLACEHOLDERS. */
export const TRIGGER_PLACEHOLDERS: Record<TemplateTrigger, string[]> = {
  ENROLLMENT_CONFIRMED: ["{student_name}", "{course_title}", "{course_url}"],
  PAYMENT_RECEIPT: ["{student_name}", "{order_id}", "{amount}", "{payment_method}"],
  ASSIGNMENT_GRADED: ["{student_name}", "{assignment_title}", "{score}", "{course_title}"],
  QUIZ_RESULT: ["{student_name}", "{quiz_title}", "{score}", "{result}"],
  LIVE_CLASS_REMINDER: ["{student_name}", "{class_title}", "{start_time}", "{join_url}"],
  CERTIFICATE_ISSUED: ["{student_name}", "{course_title}", "{certificate_url}"],
  COMMUNITY_REPLY: ["{student_name}", "{discussion_title}", "{reply_author}", "{discussion_url}"],
  COURSE_COMPLETED: ["{student_name}", "{course_title}"],
  PASSWORD_RESET: ["{student_name}", "{reset_url}", "{expires_in}"],
};

/** Inbox category of the in-app notification a trigger creates. */
export const TRIGGER_CATEGORY: Record<TemplateTrigger, NotificationCategory> = {
  ENROLLMENT_CONFIRMED: "ENROLLMENT",
  PAYMENT_RECEIPT: "PAYMENT",
  ASSIGNMENT_GRADED: "SUBMISSION",
  QUIZ_RESULT: "SUBMISSION",
  LIVE_CLASS_REMINDER: "LIVE_CLASS",
  CERTIFICATE_ISSUED: "CERTIFICATE",
  COMMUNITY_REPLY: "COMMUNITY",
  COURSE_COMPLETED: "ENROLLMENT",
  PASSWORD_RESET: "SYSTEM",
};

export interface DefaultTemplate {
  trigger: TemplateTrigger;
  name: string;
  subject: string;
  body: string;
  channels: NotificationChannel[];
  enabled: boolean;
  locked: boolean;
}

const t = (trigger: TemplateTrigger, name: string, subject: string, body: string, channels: NotificationChannel[], enabled = true, locked = false): DefaultTemplate => ({
  trigger,
  name,
  subject,
  body,
  channels,
  enabled,
  locked,
});

/** One template per trigger, created for each institution the first time Templates is opened (panel seed texts). */
export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  t("ENROLLMENT_CONFIRMED", "Enrollment confirmation", "Welcome to {course_title}!", "Hi {student_name},\n\nYou're enrolled in {course_title}. Start learning any time: {course_url}", ["IN_APP", "EMAIL"]),
  t("PAYMENT_RECEIPT", "Payment receipt", "Receipt for order {order_id}", "Hi {student_name},\n\nWe received {amount} via {payment_method}. Thank you!", ["EMAIL"]),
  t("ASSIGNMENT_GRADED", "Assignment graded", "Your assignment was graded", 'Hi {student_name},\n\n"{assignment_title}" in {course_title} was graded: {score}.', ["IN_APP", "EMAIL", "PUSH"]),
  t("QUIZ_RESULT", "Quiz result", "Your result for {quiz_title}", "Hi {student_name},\n\nYou scored {score} on {quiz_title} — {result}.", ["IN_APP"]),
  t("LIVE_CLASS_REMINDER", "Live class reminder", "{class_title} starts at {start_time}", "Hi {student_name},\n\nYour live class starts soon. Join here: {join_url}", ["IN_APP", "EMAIL", "PUSH"]),
  t("CERTIFICATE_ISSUED", "Certificate issued", "Your certificate for {course_title} is ready 🎓", "Congratulations {student_name}!\n\nDownload your certificate: {certificate_url}", ["IN_APP", "EMAIL"]),
  t("COMMUNITY_REPLY", "Community reply", "{reply_author} replied to your discussion", 'Hi {student_name},\n\n{reply_author} replied to "{discussion_title}": {discussion_url}', ["IN_APP"]),
  t("COURSE_COMPLETED", "Course completed", "You completed {course_title}!", "Amazing work, {student_name}! You've completed {course_title}.", ["IN_APP", "EMAIL"]),
  t("PASSWORD_RESET", "Password reset", "Reset your password", "Hi {student_name},\n\nReset your password here: {reset_url}\nThis link expires in {expires_in}.", ["EMAIL"], true, true),
];

export const defaultTemplateFor = (trigger: TemplateTrigger) => DEFAULT_TEMPLATES.find((d) => d.trigger === trigger)!;

/** Sample values for "send test" (panel SAMPLE_VALUES). */
export const SAMPLE_VALUES: Record<string, string> = {
  student_name: "Sarah Rahman",
  course_title: "HTML Fundamentals",
  course_url: "/courses/html-fundamentals",
  order_id: "ORD-1042",
  amount: "৳4,900",
  payment_method: "Visa •••• 4242",
  assignment_title: "Build a Simple HTML Page",
  score: "28/32",
  quiz_title: "HTML Basics Quiz",
  result: "Passed",
  class_title: "JavaScript Q&A Session",
  start_time: "10:00 AM",
  join_url: "zoom.us/j/1234567890",
  certificate_url: "/verify/EDU-HF-2026-00042",
  discussion_title: "Why does my <a> tag open in the same tab?",
  reply_author: "Arif Hossain",
  discussion_url: "/community/thread-2",
  reset_url: "/reset/••••",
  expires_in: "30 minutes",
};
