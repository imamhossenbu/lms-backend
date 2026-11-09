/**
 * Adds nine starter guides to the marketing website's blog (written by the EduPro team; edit or delete them in
 * the Owner Console › Blog). Cover photos are from Pexels (free to use under the Pexels license, no attribution
 * required) and are hot-linked from images.pexels.com.
 *
 *   npx ts-node --transpile-only prisma/seed-blog-posts.ts          # add / refresh
 *   npx ts-node --transpile-only prisma/seed-blog-posts.ts --remove # delete them
 *
 * Idempotent: matched by slug.
 */
import "dotenv/config";
import { PrismaService } from "../src/prisma/prisma.service";
import { readingMinutes } from "../src/saas/blog/blog.service";

/** A Pexels photo sized for blog covers. */
const pexels = (id: number) => `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;

const POSTS = [
  {
    slug: "run-your-first-live-class",
    coverUrl: pexels(5905709),
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
    coverUrl: pexels(5940841),
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
    coverUrl: pexels(6146929),
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
  {
    slug: "write-quizzes-that-measure-learning",
    title: "How to write quizzes that actually measure learning",
    coverUrl: pexels(5428833),
    category: "Assessments",
    tags: ["quizzes", "assessment", "question writing"],
    featured: false,
    daysAgo: 16,
    excerpt: "A quiz that every student passes tells you nothing. How to write questions that show who understood the lesson, and how to use the results to teach better.",
    content: `A good quiz is not a test of memory. It is a quick check that tells you, and the student, what was understood and what was not. Most weak quizzes have the same problems: questions that can be answered by guessing, options that give the answer away, and no feedback afterwards.

## Start from the lesson goal

Before writing a single question, finish this sentence: *"After this lesson, a student can..."*. Every question should test that goal. If a question tests a fact nobody needs, delete it.

## Write better multiple-choice questions

- **One clear correct answer.** If two options are arguably right, students who think hardest are punished.
- **Plausible wrong options.** Use the mistakes students really make. If students often forget to carry a digit, make that wrong answer one of the options.
- **Similar length options.** The longest, most detailed option is often the correct one, and students know it.
- **Avoid "all of the above".** It rewards spotting two true options rather than understanding all of them.

## Mix question types

EduPro quizzes support multiple choice, true or false, and short answers. Use true or false for quick checks of a single fact, multiple choice for applying an idea, and short answers when you want students to explain in their own words.

## Set the rules on purpose

- **Time limit:** useful for exam practice, unhelpful for a first check after a lesson.
- **Attempts:** allow two attempts on practice quizzes so students can learn from the first one.
- **Passing marks:** set them where you would be comfortable letting a student move on, not at a number that looks strict.
- **Show answers:** turn on explanations after submission. A wrong answer with a one-line explanation teaches more than a score.

## Use the results

After the first group of students finishes, open the quiz attempts and look at each question.

1. A question almost everyone got wrong is either too hard or badly worded. Read it again.
2. A question everyone got right may be too easy to be useful.
3. If many students picked the same wrong option, that misconception is worth five minutes in the next live class.

> A quiz is finished only after you have changed something because of its results.

Start with five good questions per section. That is enough to see where your students are, and short enough that they will actually take it.`,
  },
  {
    slug: "move-your-coaching-centre-online-in-30-days",
    title: "Moving your coaching centre online: a 30-day plan",
    coverUrl: pexels(5212345),
    category: "Guides",
    tags: ["getting started", "coaching centre", "planning"],
    featured: false,
    daysAgo: 21,
    excerpt: "You don't have to move everything at once. A week-by-week plan for taking a classroom coaching centre online without losing students or burning out your teachers.",
    content: `Many coaching centres try to move everything online in one weekend, then spend the next month fixing problems. A slower, planned move works better. This plan takes four weeks and keeps your classroom running the whole time.

## Week 1: set up the academy

- Add your logo, colours and contact details in **Settings**.
- Create categories that match how parents think about your classes, for example by class level or by exam.
- Invite your teachers from **Team & Roles** and give each one only the access they need.

Choose **one** batch to move first. A small group that you know well is ideal.

## Week 2: build the first course

Turn the next four weeks of that batch's syllabus into a course. Keep it simple:

1. One section per week
2. Three or four short lessons per section
3. A short quiz at the end of each section
4. The worksheets you already use, uploaded as lesson resources

You don't need studio videos. A clear screen recording with your voice is enough to start.

## Week 3: run classes online

Schedule the batch's regular classes in **Live Classes**. Students get the link and a reminder automatically, and attendance is recorded without a roll call. Keep the same days and times as the physical class so families don't have to change their routine.

Ask the students two questions at the end of the week: *What worked?* and *What was confusing?* Fix the confusing parts before you move the next batch.

## Week 4: open enrolment and payments

Turn on online payments and set the course price. Send an **announcement** to parents with the enrolment link and the fee deadline. Payments arrive in the Payments page with receipts sent automatically.

## After the first month

Once the first batch runs smoothly, move one more batch every week or two. Keep what worked, and change one thing at a time. By the end of the term most centres have their whole timetable online, and their teachers are comfortable with it because they learnt step by step.`,
  },
  {
    slug: "certificates-students-want-to-share",
    title: "Certificates students are proud to share",
    coverUrl: pexels(7713190),
    category: "Certificates",
    tags: ["certificates", "completion", "marketing"],
    featured: false,
    daysAgo: 27,
    excerpt: "A certificate is the last thing a student receives from your course and the first thing their friends see. How to design one that looks professional and can be verified.",
    content: `When a student finishes your course, the certificate is what they show their family, add to their CV and post online. A well-made certificate is good for the student and quietly promotes your academy at the same time.

## Keep the design calm

- Use your logo once, at the top.
- Make the student's name the largest text on the page.
- Name the course exactly as it appears on your website.
- Add the completion date and the name of the teacher or academy head.

Avoid busy borders and many colours. A simple layout looks more official, and it prints well.

## Make every certificate verifiable

Each EduPro certificate carries a unique **verification code**. Anyone, for example an employer or a school, can enter it on the verification page and see that the certificate is genuine, who it was issued to and when. This is what separates a real certificate from an image anyone could edit.

## Decide when certificates are issued

In the certificate template you choose the rule:

1. **Automatically**, when a student completes all lessons (and passes the required quizzes)
2. **Manually**, when a teacher decides the student is ready, useful for courses with a final project

Automatic issue is best for self-paced courses. Manual issue suits courses where a teacher reviews the final work.

## Fix mistakes properly

If a name is misspelled or a certificate was issued by mistake, revoke it and issue a corrected one. A revoked code shows as revoked on the verification page, so old copies can't be misused.

## Encourage sharing

Add one line to your completion message: *"Share your certificate and tag us, we love seeing our students' progress."* Many students will, and each post reaches people who trust them.`,
  },
  {
    slug: "academy-analytics-numbers-that-matter",
    title: "Five numbers every academy owner should check each week",
    coverUrl: pexels(4144294),
    category: "Analytics",
    tags: ["analytics", "growth", "reports"],
    featured: false,
    daysAgo: 33,
    excerpt: "Dashboards can show hundreds of numbers. These five tell you whether your academy is healthy, and what to do when one of them moves the wrong way.",
    content: `You don't need to be a data analyst to run your academy well. Ten minutes a week with the right five numbers is enough to catch most problems early.

## 1. New enrolments

How many students joined this week compared with last week? A drop usually has a simple cause: an announcement that didn't go out, a course that closed, or a holiday. A rise tells you which promotion worked, so you can do it again.

## 2. Active students

Enrolments show who paid. Active students show who is actually learning. If many enrolled students haven't opened a lesson in two weeks, send them a short, friendly reminder before they forget the course entirely.

## 3. Course completion

Look at completion by course, not just the average. One course with very low completion usually has one difficult lesson where students stop. The progress report shows you where.

## 4. Quiz results

Average scores per quiz show where teaching needs attention. A quiz with a much lower average than the others is either testing something that wasn't taught clearly, or has confusing questions.

## 5. Revenue

Compare this month's revenue with the same month last year rather than with last month. Coaching has strong seasons around exams and admissions, and month-to-month comparisons can be misleading.

## Make it a routine

Pick the same time every week, for example Sunday evening, and open **Analytics**. Write down the five numbers in a simple table. After a month you'll see patterns you never noticed, and you'll make decisions based on what is happening rather than on what feels like it is happening.

> Measure a few things consistently instead of many things occasionally.`,
  },
  {
    slug: "use-ai-to-draft-course-outlines",
    title: "Using AI to draft course outlines (and what to check yourself)",
    coverUrl: pexels(5905710),
    category: "AI",
    tags: ["ai assistant", "course design", "productivity"],
    featured: false,
    daysAgo: 38,
    excerpt: "The AI assistant can turn a topic into a full course outline and a set of quiz questions in seconds. Here is how to get a useful first draft, and the checks only a teacher can do.",
    content: `Planning a new course from a blank page is slow. The AI assistant in EduPro can give you a first draft in seconds: sections, lesson titles, and quiz questions. It saves hours, as long as you treat it as a draft and not as the final course.

## Give it a precise brief

Vague requests produce generic outlines. Compare:

- *"Make a physics course"*
- *"A 6-week physics course for class 9 students preparing for the SSC exam, covering motion, force and energy, with one live class per week"*

The second brief gives the assistant the level, the length, the exam and the format, and the outline will reflect all four.

## What the assistant is good at

- Breaking a large topic into a logical order of sections
- Suggesting lesson titles and short descriptions
- Drafting multiple-choice questions with plausible wrong answers
- Producing variations of a question for practice sets

## What you must check yourself

1. **Accuracy.** Read every fact and every quiz answer. AI can state something wrong with complete confidence.
2. **Your syllabus.** Make sure the outline matches the board or exam your students actually sit, including the order topics are taught in.
3. **Level.** Check that examples and vocabulary suit your students' age and language.
4. **Your voice.** Students enrol because of you. Add the examples, stories and shortcuts you use in class.

## A practical workflow

1. Ask for an outline and edit it until the structure is right
2. Create the sections and lessons from the edited outline
3. Record or write your lessons yourself
4. Ask for quiz questions for each section, then review each one before publishing

Used this way, the assistant handles the repetitive planning, and you spend your time on the part that matters most: teaching.`,
  },
  {
    slug: "keep-parents-in-the-loop",
    title: "Keeping parents in the loop without a hundred phone calls",
    coverUrl: pexels(4260325),
    category: "Communication",
    tags: ["parents", "announcements", "notifications"],
    featured: false,
    daysAgo: 44,
    excerpt: "Parents want to know their child is attending and progressing. A simple communication routine that answers their questions before they call.",
    content: `For school and coaching students, parents are often the ones who choose the academy and pay the fees. When they don't hear anything, they call, and those calls add up quickly. A predictable routine answers most questions before anyone picks up the phone.

## Send a start-of-term message

At the beginning of each term, send one **announcement** that covers:

- The class schedule and how students join live classes
- The fee amount, deadline and payment methods
- Who to contact for what (fees, technical problems, academic questions)

Parents keep this message and refer back to it all term.

## Share attendance and progress regularly

Live class attendance and course progress are recorded automatically. Once a month, share a short summary with each family: classes attended, lessons completed and recent quiz results. A short, regular update is more reassuring than a long report once a term.

## Use scheduled notifications

Schedule reminders ahead of time instead of sending them by hand:

1. Three days before a fee deadline
2. The evening before an important test
3. The morning of a parent meeting

Scheduled messages go out even on your busiest days.

## Keep a single channel

When information is spread across phone calls, personal messages and paper notices, things get missed. Pick the academy's announcements as the official channel and say so in your start-of-term message.

## Respond to concerns quickly

A worried parent who gets a reply within a day becomes a loyal one. When a student's attendance or scores drop, contact the family early, with the data in front of you, and suggest one concrete next step.

Good communication doesn't need more effort. It needs the same small messages, sent reliably, every term.`,
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
