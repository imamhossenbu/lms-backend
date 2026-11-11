/**
 * Fills ONE academy with SAMPLE published courses so its public website (lms-academy-site) can be previewed:
 * 3 categories, 2 instructors, 6 courses with modules + lessons, and a few approved reviews from 3 sample learners.
 * Everything is fictional and tagged: course / category slugs start with "sample-", users use @sample.edupro.invalid
 * (they can't sign in — random password hash). Remove it all before launch with --remove.
 *
 *   npx ts-node --transpile-only prisma/seed-sample-academy.ts [slug]           # add / refresh (default slug: edupro-academy)
 *   npx ts-node --transpile-only prisma/seed-sample-academy.ts [slug] --remove  # delete every sample row
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../src/prisma/prisma.service";

const DOMAIN = "@sample.edupro.invalid";
const img = (id: string) => `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;
const face = (id: string) => `https://images.unsplash.com/${id}?w=256&h=256&q=80&auto=format&fit=crop&crop=faces`;

const CATEGORIES = [
  { slug: "sample-web-development", name: "Web Development" },
  { slug: "sample-design", name: "Design" },
  { slug: "sample-business", name: "Business & Marketing" },
];

const INSTRUCTORS = [
  { key: "a", name: "Arif Chowdhury", email: `arif.instructor${DOMAIN}`, avatar: face("photo-1507003211169-0a1dd7228f2d"), headline: "Full-stack developer & mentor", expertise: "JavaScript, React, Node.js", bio: "Arif has built web products for startups for ten years and loves turning complex ideas into small, practical steps." },
  { key: "b", name: "Sadia Islam", email: `sadia.instructor${DOMAIN}`, avatar: face("photo-1494790108377-be9c29b29330"), headline: "Product designer", expertise: "UI Design, Figma, Branding", bio: "Sadia designs apps used by thousands of people every day and teaches design the way she learned it — by doing." },
];

const LEARNERS = ["Rafiq Ahmed", "Mitu Akter", "Shuvo Das"];

type Lesson = [title: string, type: string, minutes: number, preview?: boolean];
interface SampleCourse {
  slug: string;
  title: string;
  short: string;
  category: string;
  instructor: "a" | "b";
  level: string;
  price: number;
  image: string;
  students: number;
  outcomes: string[];
  requirements: string[];
  tags: string;
  modules: { title: string; lessons: Lesson[] }[];
  reviews: [learner: number, rating: number, text: string][];
}

const COURSES: SampleCourse[] = [
  {
    slug: "sample-modern-javascript",
    title: "Modern JavaScript from Zero",
    short: "Learn the language of the web step by step — variables to async code — with small projects along the way.",
    category: "sample-web-development",
    instructor: "a",
    level: "Beginner",
    price: 1500,
    image: img("photo-1461749280684-dccba630e2f6"),
    students: 412,
    outcomes: ["Write clean, modern JavaScript", "Work with arrays, objects and functions confidently", "Fetch data from APIs with async / await", "Build three small browser projects"],
    requirements: ["A computer with a web browser", "No programming experience needed"],
    tags: "JavaScript, Web",
    modules: [
      { title: "Getting started", lessons: [["Welcome to the course", "VIDEO", 6, true], ["Setting up your editor", "VIDEO", 12, true], ["How JavaScript runs", "TEXT", 8]] },
      { title: "Core language", lessons: [["Variables and types", "VIDEO", 18], ["Functions", "VIDEO", 22], ["Arrays and objects", "VIDEO", 25], ["Check your understanding", "QUIZ", 10]] },
      { title: "Async JavaScript", lessons: [["Promises explained", "VIDEO", 20], ["async / await", "VIDEO", 16], ["Build a weather app", "CODING", 40]] },
    ],
    reviews: [[0, 5, "Very clear explanations. I finally understand async code!"], [1, 5, "The small projects made everything click. Highly recommended for beginners."], [2, 4, "Great pace and examples. Would love more exercises."]],
  },
  {
    slug: "sample-react-for-beginners",
    title: "React for Beginners",
    short: "Build interactive interfaces with components, state and hooks — and ship your first React app.",
    category: "sample-web-development",
    instructor: "a",
    level: "Intermediate",
    price: 2500,
    image: img("photo-1498050108023-c5249f4df085"),
    students: 268,
    outcomes: ["Think in components", "Manage state with hooks", "Fetch and display data", "Deploy a finished React app"],
    requirements: ["Basic JavaScript knowledge"],
    tags: "React, JavaScript, Frontend",
    modules: [
      { title: "React basics", lessons: [["Why React?", "VIDEO", 8, true], ["Your first component", "VIDEO", 15], ["Props", "VIDEO", 14]] },
      { title: "State and effects", lessons: [["useState", "VIDEO", 18], ["useEffect", "VIDEO", 20], ["Quiz: hooks", "QUIZ", 10]] },
      { title: "Project", lessons: [["Build a task board", "ASSIGNMENT", 60], ["Live Q&A session", "LIVE", 60]] },
    ],
    reviews: [[0, 5, "Exactly what I needed to get started with React."], [2, 4, "Good course, the task board project was fun."]],
  },
  {
    slug: "sample-ui-design-essentials",
    title: "UI Design Essentials with Figma",
    short: "Learn layout, colour, typography and components, then design a complete mobile app screen in Figma.",
    category: "sample-design",
    instructor: "b",
    level: "Beginner",
    price: 1800,
    image: img("photo-1561070791-2526d30994b5"),
    students: 356,
    outcomes: ["Use Figma frames, auto layout and components", "Pick colours and type that work together", "Design a clean mobile app screen", "Hand off designs to developers"],
    requirements: ["A free Figma account"],
    tags: "Figma, UI Design",
    modules: [
      { title: "Design foundations", lessons: [["What makes a good interface", "VIDEO", 10, true], ["Layout and spacing", "VIDEO", 16], ["Colour and typography", "VIDEO", 18]] },
      { title: "Working in Figma", lessons: [["Frames and auto layout", "VIDEO", 22], ["Components and variants", "VIDEO", 24], ["Design a login screen", "ASSIGNMENT", 45]] },
    ],
    reviews: [[1, 5, "Sadia explains design so simply. Loved the assignments."], [0, 4, "Practical and well structured."]],
  },
  {
    slug: "sample-brand-identity",
    title: "Brand Identity Design",
    short: "Create a logo, colour palette and brand guide for a real business from brief to final presentation.",
    category: "sample-design",
    instructor: "b",
    level: "Intermediate",
    price: 2200,
    image: img("photo-1434030216411-0b793f4b4173"),
    students: 143,
    outcomes: ["Run a short brand discovery", "Sketch and refine logo ideas", "Build a simple brand guide"],
    requirements: ["Basic Figma or Illustrator skills"],
    tags: "Branding, Logo",
    modules: [
      { title: "Discovery", lessons: [["Reading a client brief", "VIDEO", 12, true], ["Mood boards", "VIDEO", 14]] },
      { title: "Design", lessons: [["Logo sketching", "VIDEO", 20], ["Colour and type for brands", "VIDEO", 18], ["Present your brand", "ASSIGNMENT", 50]] },
    ],
    reviews: [[1, 4, "Helped me land my first branding client."]],
  },
  {
    slug: "sample-digital-marketing-101",
    title: "Digital Marketing 101",
    short: "Understand social media, content and ads, and plan a simple campaign for a small business.",
    category: "sample-business",
    instructor: "a",
    level: "Beginner",
    price: 0,
    image: img("photo-1460925895917-afdab827c52f"),
    students: 590,
    outcomes: ["Know the main digital marketing channels", "Write a simple content plan", "Read basic campaign numbers"],
    requirements: [],
    tags: "Marketing, Social Media",
    modules: [
      { title: "Foundations", lessons: [["What is digital marketing?", "VIDEO", 9, true], ["Know your audience", "TEXT", 10]] },
      { title: "Channels", lessons: [["Social media basics", "VIDEO", 15], ["Content that works", "VIDEO", 14], ["Quiz", "QUIZ", 8]] },
    ],
    reviews: [[2, 5, "Free and really useful. Thank you!"], [1, 4, "Short and to the point."]],
  },
  {
    slug: "sample-freelancing-starter",
    title: "Start Freelancing with Confidence",
    short: "Set up your profile, price your work and win your first clients on global marketplaces.",
    category: "sample-business",
    instructor: "b",
    level: "Beginner",
    price: 1200,
    image: img("photo-1522202176988-66273c2fd55f"),
    students: 221,
    outcomes: ["Build a profile that gets noticed", "Write proposals clients reply to", "Price your services sensibly"],
    requirements: ["A skill you want to offer (design, writing, development…)"],
    tags: "Freelancing, Career",
    modules: [
      { title: "Getting ready", lessons: [["Is freelancing for you?", "VIDEO", 8, true], ["Your profile", "VIDEO", 16]] },
      { title: "Winning work", lessons: [["Writing proposals", "VIDEO", 18], ["Pricing", "TEXT", 10], ["Live: profile reviews", "LIVE", 60]] },
    ],
    reviews: [[0, 5, "Got my first client two weeks after finishing this course."]],
  },
];

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes("--remove");
  const slug = args.find((a) => !a.startsWith("--")) ?? "edupro-academy";
  const prisma = new PrismaService();
  try {
    const inst = await prisma.institution.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!inst) throw new Error(`No academy with slug "${slug}"`);

    // Always clear previous samples first (makes the add idempotent).
    const del = await prisma.course.deleteMany({ where: { institutionId: inst.id, slug: { startsWith: "sample-" } } });
    await prisma.category.deleteMany({ where: { institutionId: inst.id, slug: { startsWith: "sample-" } } });
    const users = await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    if (remove) {
      console.log(`Removed ${del.count} sample courses and ${users.count} sample users from ${inst.name}.`);
      return;
    }

    const password = await bcrypt.hash(randomBytes(24).toString("hex"), 10);
    const cats = new Map<string, string>();
    for (const c of CATEGORIES) {
      const row = await prisma.category.create({ data: { ...c, institutionId: inst.id, status: "ACTIVE" } });
      cats.set(c.slug, row.id);
    }
    const teachers = new Map<string, string>();
    for (const t of INSTRUCTORS) {
      const row = await prisma.user.create({
        data: { name: t.name, email: t.email, password, role: "TEACHER", status: "ACTIVE", emailVerified: true, avatar: t.avatar, headline: t.headline, expertise: t.expertise, bio: t.bio, institutionId: inst.id },
      });
      teachers.set(t.key, row.id);
    }
    const learners: string[] = [];
    for (const name of LEARNERS) {
      const row = await prisma.user.create({
        data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}${DOMAIN}`, password, role: "STUDENT", status: "ACTIVE", emailVerified: true, institutionId: inst.id },
      });
      learners.push(row.id);
    }

    for (const c of COURSES) {
      const minutes = c.modules.flatMap((m) => m.lessons).reduce((s, l) => s + l[2], 0);
      const avg = c.reviews.reduce((s, r) => s + r[1], 0) / c.reviews.length;
      const course = await prisma.course.create({
        data: {
          title: c.title,
          slug: c.slug,
          institutionId: inst.id,
          description: `<p>${c.short}</p><p>This is a <strong>sample course</strong> created to preview the academy website. Every lesson is short and practical, and you can learn at your own pace on any device.</p><h3>Who this course is for</h3><ul><li>Beginners who want a clear, structured path</li><li>Anyone who learns best by doing small projects</li></ul>`,
          shortDescription: c.short,
          thumbnail: c.image,
          categoryId: cats.get(c.category)!,
          instructorId: teachers.get(c.instructor)!,
          level: c.level,
          language: "English",
          price: c.price,
          isFree: c.price === 0,
          status: "PUBLISHED",
          durationMinutes: minutes,
          requirements: JSON.stringify(c.requirements),
          learningOutcomes: JSON.stringify(c.outcomes),
          tags: c.tags,
          ratingAverage: Math.round(avg * 10) / 10,
          totalStudents: c.students,
        },
      });
      for (const [mi, m] of c.modules.entries()) {
        const mod = await prisma.courseModule.create({ data: { courseId: course.id, title: m.title, order: mi + 1, durationMinutes: m.lessons.reduce((s, l) => s + l[2], 0) } });
        await prisma.lesson.createMany({
          data: m.lessons.map(([title, type, durationMinutes, preview], li) => ({ courseId: course.id, moduleId: mod.id, title, type, durationMinutes, order: li + 1, isPreview: !!preview, status: "PUBLISHED" })),
        });
      }
      await prisma.courseReview.createMany({ data: c.reviews.map(([who, rating, reviewText]) => ({ courseId: course.id, userId: learners[who], rating, reviewText, status: "APPROVED" })) });
    }
    console.log(`Added ${COURSES.length} sample courses, ${INSTRUCTORS.length} instructors and ${LEARNERS.length} learners to ${inst.name}. Remove with --remove.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
