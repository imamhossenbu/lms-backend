export const NotificationTemplates = {
  // কোর্স ও সার্টিফিকেট
  CERTIFICATE_ISSUED: {
    title: "Certificate Issued! 🏆",
    message: (courseName: string) =>
      `Congratulations! Your certificate for ${courseName} is ready.`,
    type: "ACHIEVEMENT",
  },
  COURSE_ENROLLMENT: {
    title: "New Course Enrolled",
    message: (courseName: string) =>
      `You have successfully enrolled in ${courseName}.`,
    type: "SUCCESS",
  },
  COURSE_COMPLETED: {
    title: "Course Completed! 🎉",
    message: (courseName: string) =>
      `Great job! You have finished all lessons for ${courseName}.`,
    type: "SUCCESS",
  },

  SECURITY_ALERT: {
    title: "Security Alert 🔐",
    message: (action: string) => `We noticed a security change: ${action}.`,
    type: "SECURITY",
  },
  PASSWORD_CHANGED: {
    title: "Password Updated",
    message: () =>
      `Your password has been successfully changed. If this wasn't you, please contact support.`,
    type: "SECURITY",
  },
  NEW_LOGIN: {
    title: "New Login Detected 🌍",
    message: (device: string) =>
      `A new login was detected on your account via ${device}.`,
    type: "SECURITY",
  },

  PAYMENT_SUCCESS: {
    title: "Payment Received 💳",
    message: (amount: string) =>
      `Your payment of ${amount} was successful. Thank you!`,
    type: "FINANCE",
  },
  PAYMENT_FAILED: {
    title: "Payment Failed ⚠️",
    message: (courseName: string) =>
      `Your payment for ${courseName} failed. Please try again to continue access.`,
    type: "ERROR",
  },
  SUBSCRIPTION_EXPIRING: {
    title: "Subscription Expiring ⏳",
    message: (days: number) =>
      `Your subscription is expiring in ${days} days. Renew now to avoid interruption.`,
    type: "WARNING",
  },

  NEW_LESSON_PUBLISHED: {
    title: "New Lesson Added 📚",
    message: (courseName: string) =>
      `A new lesson has been added to ${courseName}. Check it out now!`,
    type: "INFO",
  },
  ACCOUNT_VERIFIED: {
    title: "Account Verified ✅",
    message: () =>
      `Your account has been successfully verified. You now have full access.`,
    type: "SUCCESS",
  },
};
