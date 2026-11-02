/**
 * Students API response shapes. Field names follow the admin panel contract
 * (lms-admin-panel: src/types/student.ts + components/students/details/mockStudentDetails.ts).
 * Dates are ISO-8601 strings and durations are seconds — the frontend formats them
 * ("Oct 18, 2026", "18h 24m"). Purely visual fields (orderNumber, iconType, initials, accentColor) are derived client-side.
 */

export type StudentStatusLabel = "Active" | "Inactive" | "Suspended";

export interface StudentListItem {
  id: string;
  studentIdCode: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  status: StudentStatusLabel;
  emailVerified: boolean;
  joinDate: string;
  lastLoginAt: string | null;
  enrolledCoursesCount: number;
  completedCoursesCount: number;
  /** completed ÷ enrolled courses, 0–100. */
  completionRate: number;
  /** Average quiz percentage (best attempt per quiz), 0–100. */
  averageScore: number;
  totalWatchSeconds: number;
}

export interface Metric {
  current: number;
  total: number;
  percentage: number;
}

export interface StudentDetails extends StudentListItem {
  /** Average progress across enrolled courses, 0–100. */
  overallProgress: number;
  learningMetrics: {
    completedLessons: Metric;
    quizzesPassed: Metric;
    assignmentsSubmitted: Metric;
    certificatesEarned: Metric;
  };
}

export type EnrolledCourseStatus = "Not Started" | "In Progress" | "Completed";

export interface StudentCourseItem {
  id: string;
  enrollmentId: string;
  title: string;
  slug: string;
  thumbnailUrl: string | null;
  category: string;
  instructor: { id: string; name: string; avatarUrl: string | null };
  progress: number;
  status: EnrolledCourseStatus;
  completedLessons: number;
  totalLessons: number;
  enrolledDate: string;
  completedDate: string | null;
  lastAccessedAt: string | null;
  certificateEarned: boolean;
}

export type QuizResultStatus = "Passed" | "Failed" | "Not Attempted";

export interface StudentQuizItem {
  id: string;
  title: string;
  courseId: string;
  course: string;
  attemptsCount: number;
  attemptedOn: string | null;
  scoreCurrent: number | null;
  scoreTotal: number;
  percentage: number | null;
  passingScore: number;
  status: QuizResultStatus;
  timeTakenSeconds: number | null;
}

export type AssignmentSubmissionLabel = "Submitted" | "Pending" | "Not Submitted";

export interface StudentAssignmentItem {
  id: string;
  title: string;
  courseId: string;
  courseTitle: string;
  dueDate: string;
  submissionStatus: AssignmentSubmissionLabel;
  submittedOn: string | null;
  /** null until graded. */
  marksObtained: number | null;
  totalMarks: number;
  /** Letter grade from marks (null until graded). */
  grade: string | null;
  fileUrl: string | null;
}

export interface StudentCertificateItem {
  id: string;
  courseId: string;
  course: string;
  status: "Issued" | "Not Earned";
  issuedOn: string | null;
  certificateId: string | null;
  verificationCode: string | null;
  certificateUrl: string | null;
}

export type StudentActivityType = "enrolled_course" | "completed_quiz" | "failed_quiz" | "submitted_assignment" | "earned_certificate" | "account_created";

export interface StudentActivityItem {
  id: string;
  activityType: StudentActivityType;
  activityTitle: string;
  details: string;
  relatedItemName: string;
  relatedItemType: "Course" | "Quiz" | "Assignment" | "Certificate" | "Account";
  at: string;
}

export type StudentNoteCategoryValue = "good_progress" | "needs_improvement" | "student_support" | "counseling_call" | "payment_issue" | "general";

export interface StudentNoteItem {
  id: string;
  category: StudentNoteCategoryValue;
  categoryLabel: string;
  content: string;
  author: { id: string; name: string; role: string; avatarUrl: string | null };
  createdAt: string;
  updatedAt: string;
}
