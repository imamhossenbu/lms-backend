/**
 * Adds three starter guides to the marketing website's blog (written by the EduPro team; edit or delete them in
 * the Owner Console › Blog).
 *
 *   npx ts-node --transpile-only prisma/seed-blog-posts.ts          # add / refresh
 *   npx ts-node --transpile-only prisma/seed-blog-posts.ts --remove # delete them
 *
 * Idempotent: matched by slug.
 */
import "dotenv/config";
import { PrismaService } from "../src/prisma/prisma.service";
import { readingMinutes } from "../src/saas/blog/blog.service";

const POSTS = [
  {
    slug: "run-your-first-live-class",
    title: "How to run your first live class without the stress",
    category: "Live Classes",
    tags: ["live classes", "zoom", "google meet", "getting started"],
    featured: true,
    daysAgo: 2,
    excerpt: "A practical checklist for teachers taking their first class online: what to prepare the day before, how to start on time, and how to keep every student involved.",
    content: `Your first live class can feel like a performance. It doesn't have to. Most problems in a first class come from three things: students who can't find the link, a teacher who is still setting up when the class should start, and a quiet room where nobody answers. This guide fixes all three.

## The day before

Create the class in **Live Classes** and pick Zoom or Google Meet. EduPro sends the link and a reminder to every enrolled student, so nobody has to ask for it on WhatsApp.

- Write a one-line goal for the class, for example *"Students can solve two-step linear equations."*
- Upload the slides or worksheet as a class resource so students can open it during the class.
- Prepare one short warm-up question you will ask in the first two minutes.

## Fifteen minutes before

Join early, share your screen once to check it works, and keep the worksheet open in a second tab.

> Start on time even if only half the class has joined. Students learn quickly that the class really begins at 7:00, not 7:10.

## During the class

Teach in blocks of about ten minutes, then ask a question. Use names: *"Rafiq, what would you do next?"* works far better than *"Any questions?"*

1. Warm-up question (2 minutes)
2. Teach the first idea (10 minutes)
3. Students try one problem on their own (5 minutes)
4. Go through the answer together, then repeat for the next idea

## After the class

Attendance is recorded for you. Attach the recording to the class so students who missed it can catch up, and post one practice question in the community so the conversation continues.

## A simple checklist

- Class created and reminder sent
- Goal written down
- Resource uploaded
- Warm-up question ready
- Recording attached afterwards

Run this checklist for your first five classes and it will become a habit. By the tenth class, you won't need it.`,
  },
  {
    slug: "keep-students-engaged-in-online-courses",
    title: "7 ways to keep students engaged in an online course",
    category: "Teaching",
    tags: ["engagement", "courses", "quizzes", "community"],
    featured: false,
    daysAgo: 6,
    excerpt: "Students rarely drop a course because it is too hard. They drop it because they lose momentum. Seven small habits that keep learners coming back every week.",
    content: `Completion rates in online courses are low almost everywhere, and the reason is rarely difficulty. Students drift away when nothing pulls them back. These seven habits are small, but together they make a visible difference in your analytics.

## 1. Keep lessons short

Aim for lessons of 5–12 minutes. A long topic works better as three short lessons than as one 40-minute video. Short lessons are easier to start, and starting is the hardest part.

## 2. Release content on a schedule

Use **drip scheduling** to open one section a week. A predictable rhythm gives students a reason to come back, and stops them from skimming everything on day one and then disappearing.

## 3. End every section with a quiz

A five-question quiz at the end of a section tells students what they actually understood. Keep it low-pressure: allow two attempts and show the correct answer with a short explanation.

## 4. Answer questions in public

When a student asks something in the **community**, answer it there instead of in a private message. Mark the best reply as accepted. The next student with the same question finds the answer in seconds.

## 5. Use free preview lessons

Make the first lesson of each course a free preview. Visitors can see your teaching style before they pay, and the students who enrol already know what to expect.

## 6. Celebrate completion

Turn on automatic **certificates**. A certificate with the student's name and a verification code is something they share with family and on social media, which also brings you new students.

## 7. Watch where students stop

Open **Analytics** once a week and look for the lesson where progress drops. That lesson is usually too long, too fast, or missing an example. Fix one lesson a week.

---

None of these needs a big budget or new equipment. Pick two to start with this week, and add the rest over the next month.`,
  },
  {
    slug: "collect-course-fees-with-bkash",
    title: "Collecting course fees online with bKash and SSLCommerz",
    category: "Payments",
    tags: ["payments", "bkash", "sslcommerz", "coupons"],
    featured: false,
    daysAgo: 11,
    excerpt: "Stop chasing fees in cash. How to sell courses online with the payment methods your students already use, issue receipts automatically and run a discount campaign.",
    content: `Collecting fees by hand takes hours every month: reminding parents, writing receipts, matching payments to students. Selling your courses online removes most of that work, and students can pay the way they already pay for everything else.

## Choose your payment methods

EduPro supports **bKash**, **SSLCommerz** (cards, mobile banking and internet banking) and **Stripe** for international students. Most academies in Bangladesh turn on bKash and SSLCommerz together, which covers nearly every student.

## Set a price for each course

Open a course, go to its pricing settings and enter the price. You can keep some courses free, for example an introductory course, and charge for the full programme.

## What the student sees

1. The student opens the course page and clicks **Enrol**
2. They choose bKash or another method and complete the payment
3. They are enrolled immediately and get a receipt by email

No one has to confirm the payment by hand, and the order appears in **Payments** with its status.

## Run a discount campaign

Create a coupon, for example \`EID20\` for 20% off, with an end date and a limit on how many times it can be used. Share the code in your announcement. The order list shows exactly how many students used it.

## Handle refunds properly

If a student needs a refund, issue it from the order. The status changes to **Refunded**, and the student loses access to the course automatically, so your records always match reality.

> Tip: write your refund policy in one short paragraph and link to it from every course page. Clear rules prevent most disputes.

## Check your revenue

The revenue report shows income by course and by month. Compare it with your enrolments to see which courses are worth promoting next term.

Moving fees online usually takes one afternoon to set up, and it gives you back several hours every month.`,
  },
];

(async () => {
  const p: any = new PrismaService();
  try {
    if (process.argv.includes("--remove")) {
      const { count } = await p.blogPost.deleteMany({ where: { slug: { in: POSTS.map((x) => x.slug) } } });
      console.log(`removed ${count} starter posts`);
      return;
    }
    for (const { daysAgo, ...post } of POSTS) {
      const data = { ...post, authorName: "EduPro Team", authorRole: "Product & teaching team", isPublished: true, readMinutes: readingMinutes(post.content), publishedAt: new Date(Date.now() - daysAgo * 86_400_000) };
      await p.blogPost.upsert({ where: { slug: post.slug }, create: data, update: data });
    }
    console.log(`seeded ${POSTS.length} starter posts`);
  } finally {
    await p.$disconnect();
  }
})();
