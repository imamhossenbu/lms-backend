/**
 * Fills ONE academy with realistic SAMPLE data so its public website (lms-academy-site) can be previewed:
 * 5 categories, 5 instructors, 11 published courses (modules + lessons, BDT prices), 8 learners with approved
 * reviews, and website content (hero, mission, FAQ, newsletter copy). Everything is fictional and tagged:
 * course / category slugs start with "sample-", users use @sample.edupro.invalid (random password — they can't
 * sign in), the site content row carries `_sample: true` (an academy's own content is never overwritten).
 * Photos: Unsplash (free to use under the Unsplash licence).
 *
 *   npx ts-node --transpile-only prisma/seed-sample-academy.ts [slug]           # add / refresh (default: edupro-academy)
 *   npx ts-node --transpile-only prisma/seed-sample-academy.ts [slug] --remove  # delete every sample row
 *   … --password=<pw>   give every sample instructor / learner this password so you can sign in as them
 *                       (instructors → admin panel teacher mode, learners → academy site). Without it the
 *                       accounts get a random password and can't sign in.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../src/prisma/prisma.service";

const DOMAIN = "@sample.edupro.invalid";
const img = (id: string) => `https://images.unsplash.com/${id}?w=1200&q=80&auto=format&fit=crop`;
const face = (id: string) => `https://images.unsplash.com/${id}?w=256&h=256&q=80&auto=format&fit=crop&crop=faces`;

/** Free stock clips (Pexels licence) used as sample lesson videos. */
const VIDEOS = [
  "https://videos.pexels.com/video-files/6985689/6985689-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/3209828/3209828-hd_1920_1080_25fps.mp4",
  "https://videos.pexels.com/video-files/5495845/5495845-hd_1920_1080_30fps.mp4",
];

/** Sample lesson body for every lesson type (rich text, as the course builder saves it). */
function lessonBody(title: string, type: string, course: string): string {
  const intro = `<p>In <strong>${title}</strong> you take one focused step in <em>${course}</em>. Work through it at your own pace and come back whenever you need a refresher.</p>`;
  switch (type) {
    case "VIDEO":
      return `${intro}<h3>Key takeaways</h3><ul><li>Watch the full video once without pausing.</li><li>Re-watch the parts you want to practise and follow along.</li><li>Write down one question to bring to the next live session.</li></ul>`;
    case "TEXT":
      return `${intro}<h3>Read this first</h3><p>Good learners don't try to memorise everything. They understand the idea, try it, and then look things up when they need them.</p><ol><li>Skim the whole lesson.</li><li>Read it again slowly and try each example.</li><li>Explain it to yourself in one sentence.</li></ol><blockquote>Tip: short daily practice beats one long session per week.</blockquote>`;
    case "CODING":
      return `${intro}<h3>Your task</h3><p>Build the exercise described below on your own computer, then compare it with the starter files in the resources.</p><pre><code>// Start here\nfunction solve(input) {\n  // your code\n}\n</code></pre><p>When it works, mark this lesson as complete.</p>`;
    case "ASSIGNMENT":
      return `${intro}<h3>Assignment brief</h3><p>Create the deliverable described in this lesson and share it in the course discussion for feedback.</p><ul><li>Follow the checklist in the resources.</li><li>Keep it simple — finished beats perfect.</li><li>Mark the lesson complete when you've shared it.</li></ul>`;
    case "LIVE":
      return `${intro}<h3>Live session</h3><p>This lesson is a live class with your instructor. The schedule is announced in the course a week ahead, and the recording is added here afterwards.</p><ul><li>Bring your questions.</li><li>Keep your project open so we can review it together.</li></ul>`;
    default:
      return intro;
  }
}

type SampleQuestion = { kind: "MULTIPLE_CHOICE" | "MULTIPLE_SELECT" | "TRUE_FALSE"; text: string; options: string[]; correct: number[]; explanation: string };
/** Questions for the QUIZ lessons, by course slug. */
const QUIZZES: Record<string, SampleQuestion[]> = {
  "sample-complete-web-development": [
    { kind: "MULTIPLE_CHOICE", text: "Which keyword declares a variable that can't be reassigned?", options: ["var", "let", "const", "static"], correct: [2], explanation: "const creates a binding that can't be reassigned." },
    { kind: "TRUE_FALSE", text: "Arrays in JavaScript can hold values of different types.", options: ["True", "False"], correct: [0], explanation: "An array can mix numbers, strings, objects and more." },
    { kind: "MULTIPLE_SELECT", text: "Which of these are DOM events?", options: ["click", "submit", "deploy", "input"], correct: [0, 1, 3], explanation: "deploy isn't a DOM event." },
  ],
  "sample-react-nextjs-masterclass": [
    { kind: "MULTIPLE_CHOICE", text: "Which hook stores state in a function component?", options: ["useEffect", "useState", "useMemo", "useRef"], correct: [1], explanation: "useState returns the value and a setter." },
    { kind: "TRUE_FALSE", text: "Server components can use useState.", options: ["True", "False"], correct: [1], explanation: "Hooks with state only run in client components." },
    { kind: "MULTIPLE_CHOICE", text: "In the App Router, which file defines a route's UI?", options: ["index.tsx", "route.tsx", "page.tsx", "view.tsx"], correct: [2], explanation: "page.tsx makes a route publicly accessible." },
  ],
  "sample-python-for-beginners": [
    { kind: "MULTIPLE_CHOICE", text: "What does print(3 * 'ab') show?", options: ["3ab", "ababab", "Error", "ab3"], correct: [1], explanation: "Multiplying a string repeats it." },
    { kind: "TRUE_FALSE", text: "Python uses indentation to group code blocks.", options: ["True", "False"], correct: [0], explanation: "Indentation defines blocks in Python." },
    { kind: "MULTIPLE_CHOICE", text: "Which loop runs while a condition is true?", options: ["for", "while", "repeat", "loop"], correct: [1], explanation: "while keeps looping until the condition becomes false." },
  ],
  "sample-data-analysis-python-excel": [
    { kind: "MULTIPLE_CHOICE", text: "Which Excel feature summarises data by category quickly?", options: ["VLOOKUP", "Pivot table", "Freeze panes", "Flash fill"], correct: [1], explanation: "Pivot tables group and summarise data." },
    { kind: "TRUE_FALSE", text: "Cleaning data usually comes before analysing it.", options: ["True", "False"], correct: [0], explanation: "Messy data gives misleading results." },
    { kind: "MULTIPLE_SELECT", text: "Which are good chart choices for comparing categories?", options: ["Bar chart", "Column chart", "Pie chart with 15 slices", "Line chart over time"], correct: [0, 1], explanation: "Bars and columns compare categories clearly." },
  ],
  "sample-digital-marketing-mastery": [
    { kind: "MULTIPLE_CHOICE", text: "What should you define before running any ad?", options: ["Font size", "Target audience and goal", "Logo colour", "Posting time only"], correct: [1], explanation: "Audience and goal decide everything else." },
    { kind: "TRUE_FALSE", text: "A higher click-through rate always means more sales.", options: ["True", "False"], correct: [1], explanation: "Clicks don't guarantee purchases — check conversions." },
    { kind: "MULTIPLE_CHOICE", text: "SEO mainly improves…", options: ["Paid ad reach", "Organic search visibility", "Email open rates", "Video quality"], correct: [1], explanation: "SEO helps you rank in unpaid search results." },
  ],
};

const CATEGORIES = [
  { slug: "sample-web-app", name: "Web & App Development", icon: "code" },
  { slug: "sample-programming-data", name: "Programming & Data", icon: "data" },
  { slug: "sample-design-creative", name: "Design & Creative", icon: "design" },
  { slug: "sample-business-marketing", name: "Business & Marketing", icon: "business" },
  { slug: "sample-language-career", name: "Language & Career", icon: "language" },
];

const INSTRUCTORS = {
  arif: { name: "Arif Chowdhury", avatar: face("photo-1507003211169-0a1dd7228f2d"), headline: "Senior Full-stack Engineer", expertise: "JavaScript, React, Next.js, Flutter", bio: "Arif has shipped web and mobile products for startups in Dhaka and Berlin for over ten years. He teaches the way he works: small steps, real projects, and code reviews that explain the why." },
  sadia: { name: "Sadia Islam", avatar: face("photo-1494790108377-be9c29b29330"), headline: "Product Designer", expertise: "UI/UX, Figma, Branding, Video", bio: "Sadia designs apps used by thousands of people every day. Before teaching she led design at a fintech startup, and she still freelances for international clients." },
  tanvir: { name: "Tanvir Hasan", avatar: face("photo-1500648767791-00dcc994a43e"), headline: "Data Analyst & Python Trainer", expertise: "Python, SQL, Excel, Power BI", bio: "Tanvir turns messy spreadsheets into decisions for retail and NGO teams. He has trained more than 2,000 students to write their first Python program." },
  nusrat: { name: "Nusrat Jahan", avatar: face("photo-1438761681033-6461ffad8d80"), headline: "Growth Marketer & Freelancer", expertise: "Digital Marketing, Facebook Ads, SEO, Freelancing", bio: "Nusrat has run campaigns for e-commerce brands across Bangladesh and has been a top-rated freelancer since 2018. She loves helping first-time freelancers win their first client." },
  farhana: { name: "Farhana Akter", avatar: face("photo-1544005313-94ddf0286df2"), headline: "IELTS & Communication Coach", expertise: "Spoken English, IELTS, Presentations", bio: "Farhana has coached professionals and students for job interviews and IELTS for eight years, with a focus on confident, everyday speaking." },
} as const;
type Teacher = keyof typeof INSTRUCTORS;

const LEARNERS = ["Rafiq Ahmed", "Mitu Akter", "Shuvo Das", "Tasnim Rahman", "Imran Hossain", "Nadia Sultana", "Sabbir Khan", "Ayesha Siddiqua"];

type Lesson = [title: string, type: "VIDEO" | "TEXT" | "QUIZ" | "ASSIGNMENT" | "CODING" | "LIVE", minutes: number, preview?: true];
interface SampleCourse {
  slug: string;
  title: string;
  short: string;
  about: string;
  category: string;
  teacher: Teacher;
  level: "Beginner" | "Intermediate" | "Advanced";
  price: number;
  image: string;
  students: number;
  tags: string;
  outcomes: string[];
  requirements: string[];
  modules: [string, Lesson[]][];
  reviews: [learner: number, rating: number, text: string][];
}

const COURSES: SampleCourse[] = [
  {
    slug: "sample-complete-web-development",
    title: "Complete Web Development with JavaScript",
    short: "Go from zero to job-ready web developer — HTML, CSS, JavaScript, Git and your first deployed projects.",
    about: "A structured path for absolute beginners. You will build five real projects, learn to use Git like a professional and deploy everything online so you have a portfolio by the end.",
    category: "sample-web-app",
    teacher: "arif",
    level: "Beginner",
    price: 5500,
    image: img("photo-1517694712202-14dd9538aa97"),
    students: 1240,
    tags: "HTML, CSS, JavaScript, Git",
    outcomes: ["Build responsive websites with HTML and modern CSS", "Write clean JavaScript and work with the DOM", "Use Git and GitHub for every project", "Deploy five portfolio projects online"],
    requirements: ["A computer with internet access", "No coding experience needed"],
    modules: [
      ["Getting started", [["Welcome & how this course works", "VIDEO", 6, true], ["Setting up VS Code and Chrome DevTools", "VIDEO", 14, true], ["How the web works", "TEXT", 10]]],
      ["HTML & CSS foundations", [["Semantic HTML", "VIDEO", 22], ["Flexbox and Grid", "VIDEO", 35], ["Responsive design", "VIDEO", 28], ["Build a landing page", "ASSIGNMENT", 60]]],
      ["JavaScript essentials", [["Variables, types and functions", "VIDEO", 30], ["Arrays and objects", "VIDEO", 32], ["DOM and events", "VIDEO", 36], ["JavaScript quiz", "QUIZ", 15]]],
      ["Ship it", [["Git & GitHub", "VIDEO", 25], ["Deploy to Netlify", "VIDEO", 12], ["Live Q&A: portfolio review", "LIVE", 60]]],
    ],
    reviews: [[0, 5, "I had never written code before. Now I have a portfolio with five live projects!"], [3, 5, "Arif bhai explains every line. The assignments made everything click."], [5, 4, "Great structure. I wish there were more JavaScript exercises, but overall excellent."]],
  },
  {
    slug: "sample-react-nextjs-masterclass",
    title: "React & Next.js Masterclass",
    short: "Build fast, modern web apps with React, Next.js App Router, TypeScript and Tailwind CSS.",
    about: "For developers who know JavaScript and want to build production-grade apps. We build a complete e-commerce front-end with authentication, server components and API routes.",
    category: "sample-web-app",
    teacher: "arif",
    level: "Intermediate",
    price: 6500,
    image: img("photo-1555066931-4365d14bab8c"),
    students: 860,
    tags: "React, Next.js, TypeScript, Tailwind",
    outcomes: ["Think in components and manage state with hooks", "Use the Next.js App Router and server components", "Type your app with TypeScript", "Deploy a full e-commerce front-end"],
    requirements: ["Comfortable with JavaScript basics", "Basic HTML and CSS"],
    modules: [
      ["React fundamentals", [["Why React?", "VIDEO", 8, true], ["Components and props", "VIDEO", 24], ["State and effects", "VIDEO", 30]]],
      ["Next.js App Router", [["Routing and layouts", "VIDEO", 26], ["Server vs client components", "VIDEO", 28], ["Data fetching", "VIDEO", 32], ["Quiz: App Router", "QUIZ", 12]]],
      ["Project: ShopNow", [["Product pages", "CODING", 50], ["Cart and checkout UI", "CODING", 55], ["Deploy on Vercel", "VIDEO", 14], ["Live code review", "LIVE", 60]]],
    ],
    reviews: [[1, 5, "Finally understood server components. The ShopNow project is now my best portfolio piece."], [4, 5, "Very up to date with the latest Next.js. Worth every taka."]],
  },
  {
    slug: "sample-flutter-app-development",
    title: "Flutter App Development",
    short: "Create beautiful Android and iOS apps from one codebase with Flutter and Firebase.",
    about: "Learn Dart and Flutter by building three apps: a to-do app, a news reader and a chat app with Firebase authentication and real-time data.",
    category: "sample-web-app",
    teacher: "arif",
    level: "Intermediate",
    price: 6000,
    image: img("photo-1512941937669-90a1b58e7e9c"),
    students: 540,
    tags: "Flutter, Dart, Firebase, Mobile",
    outcomes: ["Write Dart confidently", "Build responsive Flutter layouts", "Connect apps to Firebase", "Publish an app build"],
    requirements: ["Basic programming knowledge in any language"],
    modules: [
      ["Dart crash course", [["Hello Dart", "VIDEO", 10, true], ["Classes and async", "VIDEO", 26]]],
      ["Flutter UI", [["Widgets and layouts", "VIDEO", 30], ["Navigation", "VIDEO", 20], ["Build a to-do app", "ASSIGNMENT", 60]]],
      ["Firebase", [["Authentication", "VIDEO", 28], ["Firestore chat", "CODING", 55], ["Release build", "VIDEO", 15]]],
    ],
    reviews: [[6, 5, "Published my first app on Play Store after this course!"], [2, 4, "Clear and practical. The chat app was challenging but fun."]],
  },
  {
    slug: "sample-python-for-beginners",
    title: "Python Programming for Beginners",
    short: "Learn to code with Python — the friendliest first language — through small, fun exercises.",
    about: "A free starter course. Variables, loops, functions and files explained with everyday examples, plus mini-projects like a quiz game and an expense tracker.",
    category: "sample-programming-data",
    teacher: "tanvir",
    level: "Beginner",
    price: 0,
    image: img("photo-1526379095098-d400fd0bf935"),
    students: 3120,
    tags: "Python, Programming",
    outcomes: ["Write and run Python programs", "Use loops, conditions and functions", "Work with lists and dictionaries", "Build two mini-projects"],
    requirements: [],
    modules: [
      ["First steps", [["Install Python and VS Code", "VIDEO", 10, true], ["Your first program", "VIDEO", 12, true], ["Variables and input", "VIDEO", 18]]],
      ["Control flow", [["If / else", "VIDEO", 16], ["Loops", "VIDEO", 22], ["Practice set", "QUIZ", 10]]],
      ["Mini-projects", [["Quiz game", "CODING", 35], ["Expense tracker", "CODING", 40]]],
    ],
    reviews: [[3, 5, "Best free course I have found. Tanvir bhai is very patient."], [7, 5, "Short videos, lots of practice. Perfect for beginners."], [1, 4, "Loved the mini-projects."]],
  },
  {
    slug: "sample-data-analysis-python-excel",
    title: "Data Analysis with Python & Excel",
    short: "Clean, analyse and visualise real data with Excel, pandas and Power BI — and present insights that matter.",
    about: "Work with real Bangladeshi retail and survey datasets. You will build dashboards, answer business questions and finish with a capstone report for your portfolio.",
    category: "sample-programming-data",
    teacher: "tanvir",
    level: "Beginner",
    price: 4800,
    image: img("photo-1551288049-bebda4e38f71"),
    students: 690,
    tags: "Data Analysis, Excel, pandas, Power BI",
    outcomes: ["Clean messy data in Excel and pandas", "Create charts and dashboards", "Answer business questions with data", "Present a capstone analysis"],
    requirements: ["Basic computer skills", "Python basics help but aren't required"],
    modules: [
      ["Excel for analysts", [["Course tour", "VIDEO", 6, true], ["Formulas and pivot tables", "VIDEO", 34], ["Excel practice", "QUIZ", 12]]],
      ["Python & pandas", [["DataFrames", "VIDEO", 30], ["Cleaning data", "VIDEO", 28], ["Grouping and merging", "CODING", 40]]],
      ["Dashboards", [["Power BI basics", "VIDEO", 32], ["Capstone report", "ASSIGNMENT", 90], ["Live: capstone feedback", "LIVE", 60]]],
    ],
    reviews: [[4, 5, "Got an internship as a data analyst thanks to my capstone project."], [5, 4, "Practical datasets from Bangladesh made it relatable."]],
  },
  {
    slug: "sample-ui-ux-design-figma",
    title: "UI/UX Design with Figma",
    short: "Design user-friendly apps and websites — research, wireframes, components and polished prototypes in Figma.",
    about: "Learn the full design process on a real brief: interview users, map journeys, wireframe, build a design system and hand off a clickable prototype.",
    category: "sample-design-creative",
    teacher: "sadia",
    level: "Beginner",
    price: 4500,
    image: img("photo-1561070791-2526d30994b5"),
    students: 980,
    tags: "UI Design, UX, Figma, Prototyping",
    outcomes: ["Run simple user research", "Wireframe and prototype in Figma", "Build components with auto layout", "Hand off designs to developers"],
    requirements: ["A free Figma account"],
    modules: [
      ["UX foundations", [["What is UX?", "VIDEO", 10, true], ["User interviews", "VIDEO", 20], ["Journey maps", "TEXT", 12]]],
      ["Figma skills", [["Frames and auto layout", "VIDEO", 26], ["Components and variants", "VIDEO", 30], ["Design a login flow", "ASSIGNMENT", 60]]],
      ["Prototype & hand-off", [["Interactive prototypes", "VIDEO", 22], ["Dev hand-off", "VIDEO", 14], ["Live portfolio review", "LIVE", 60]]],
    ],
    reviews: [[1, 5, "Sadia apu explains design so simply. My case study got me interviews!"], [7, 5, "The design system module was gold."], [2, 4, "Very practical, great feedback on assignments."]],
  },
  {
    slug: "sample-graphic-design-social-media",
    title: "Graphic Design for Social Media",
    short: "Create scroll-stopping posts, banners and ads with Canva and Photoshop — no design degree needed.",
    about: "Learn colour, typography and layout, then design a full month of social content for a brand. Includes templates and a client-ready portfolio.",
    category: "sample-design-creative",
    teacher: "sadia",
    level: "Beginner",
    price: 2500,
    image: img("photo-1626785774573-4b799315345d"),
    students: 1450,
    tags: "Graphic Design, Canva, Photoshop",
    outcomes: ["Apply colour, type and layout basics", "Design posts and ads in Canva and Photoshop", "Create a brand content calendar", "Build a design portfolio"],
    requirements: ["A laptop; Photoshop optional"],
    modules: [
      ["Design basics", [["Colour and contrast", "VIDEO", 14, true], ["Typography", "VIDEO", 16]]],
      ["Tools", [["Canva pro tips", "VIDEO", 20], ["Photoshop essentials", "VIDEO", 32], ["Design 5 posts", "ASSIGNMENT", 60]]],
      ["Portfolio", [["Brand content calendar", "TEXT", 15], ["Portfolio on Behance", "VIDEO", 12]]],
    ],
    reviews: [[3, 5, "Now I design posts for three local shops. Thank you!"], [6, 4, "Good course for beginners."]],
  },
  {
    slug: "sample-video-editing-premiere",
    title: "Video Editing with Premiere Pro",
    short: "Edit YouTube videos, reels and ads like a pro — cuts, colour, sound and motion graphics.",
    about: "Project-based editing course: you edit a vlog, a product ad and three reels using footage we provide, then learn how to price editing work.",
    category: "sample-design-creative",
    teacher: "sadia",
    level: "Intermediate",
    price: 3000,
    image: img("photo-1574717024653-61fd2cf4d44d"),
    students: 620,
    tags: "Video Editing, Premiere Pro, Reels",
    outcomes: ["Edit with a fast Premiere Pro workflow", "Colour-correct and grade footage", "Mix voice, music and effects", "Export for YouTube and social"],
    requirements: ["Premiere Pro (trial is fine)"],
    modules: [
      ["Editing workflow", [["Interface tour", "VIDEO", 12, true], ["Cutting and trimming", "VIDEO", 24]]],
      ["Polish", [["Colour grading", "VIDEO", 26], ["Audio mixing", "VIDEO", 20], ["Edit a product ad", "ASSIGNMENT", 60]]],
    ],
    reviews: [[4, 5, "I edit reels for clients now. Super practical course."]],
  },
  {
    slug: "sample-digital-marketing-mastery",
    title: "Digital Marketing Mastery",
    short: "Grow any business online — Facebook & Google ads, SEO, content and analytics with a real budget plan.",
    about: "Plan and launch campaigns step by step. You will create a marketing plan for a real or sample business, run ads with a small budget and read the results.",
    category: "sample-business-marketing",
    teacher: "nusrat",
    level: "Beginner",
    price: 3500,
    image: img("photo-1460925895917-afdab827c52f"),
    students: 1780,
    tags: "Digital Marketing, Facebook Ads, SEO",
    outcomes: ["Write a simple marketing plan", "Run Facebook and Google ad campaigns", "Improve SEO for a website", "Read analytics and optimise"],
    requirements: [],
    modules: [
      ["Strategy", [["How digital marketing works", "VIDEO", 10, true], ["Know your audience", "TEXT", 12], ["Marketing plan", "ASSIGNMENT", 45]]],
      ["Paid ads", [["Facebook Ads Manager", "VIDEO", 34], ["Google Ads basics", "VIDEO", 28], ["Ads quiz", "QUIZ", 10]]],
      ["SEO & analytics", [["On-page SEO", "VIDEO", 24], ["Google Analytics 4", "VIDEO", 22], ["Live: campaign clinic", "LIVE", 60]]],
    ],
    reviews: [[5, 5, "My Facebook page sales doubled in a month after applying this."], [0, 5, "Clear, practical and up to date."], [7, 4, "Loved the campaign clinic."]],
  },
  {
    slug: "sample-freelancing-kickstart",
    title: "Freelancing Career Kickstart",
    short: "Set up a winning profile on Upwork and Fiverr, write proposals clients reply to, and get paid safely.",
    about: "Everything a new freelancer needs: picking a niche, building a portfolio, writing proposals, pricing, client communication and receiving payments in Bangladesh.",
    category: "sample-business-marketing",
    teacher: "nusrat",
    level: "Beginner",
    price: 1500,
    image: img("photo-1522202176988-66273c2fd55f"),
    students: 2210,
    tags: "Freelancing, Upwork, Fiverr, Career",
    outcomes: ["Choose a profitable niche", "Create profiles that convert", "Write proposals that win jobs", "Get paid safely"],
    requirements: ["A skill you want to offer"],
    modules: [
      ["Getting ready", [["Is freelancing for you?", "VIDEO", 9, true], ["Pick your niche", "VIDEO", 14]]],
      ["Winning work", [["Profile makeover", "VIDEO", 22], ["Proposal templates", "TEXT", 15], ["Write 3 proposals", "ASSIGNMENT", 40]]],
      ["Getting paid", [["Pricing your work", "VIDEO", 16], ["Payoneer & bank transfer", "VIDEO", 12]]],
    ],
    reviews: [[2, 5, "Got my first client two weeks after finishing!"], [6, 5, "The proposal templates are a game changer."]],
  },
  {
    slug: "sample-spoken-english-professionals",
    title: "Spoken English for Professionals",
    short: "Speak English with confidence at work — interviews, meetings, presentations and emails.",
    about: "Daily speaking drills, role-plays and live practice sessions focused on real workplace situations. Ideal for job seekers and young professionals.",
    category: "sample-language-career",
    teacher: "farhana",
    level: "Beginner",
    price: 2000,
    image: img("photo-1546410531-bb4caa6b424d"),
    students: 1360,
    tags: "Spoken English, Communication, Interview",
    outcomes: ["Introduce yourself confidently", "Answer common interview questions", "Lead short meetings and presentations", "Write clear professional emails"],
    requirements: [],
    modules: [
      ["Confidence first", [["Overcoming the fear of speaking", "VIDEO", 12, true], ["Pronunciation basics", "VIDEO", 18]]],
      ["At work", [["Job interviews", "VIDEO", 24], ["Meetings and small talk", "VIDEO", 20], ["Record a self-introduction", "ASSIGNMENT", 30]]],
      ["Practice", [["Professional emails", "TEXT", 14], ["Live speaking club", "LIVE", 60]]],
    ],
    reviews: [[7, 5, "Cracked my bank job interview in English. Thank you Farhana apu!"], [0, 4, "Speaking club sessions are very helpful."]],
  },
];

const SITE = {
  _sample: true,
  hero: { title: "Build Skills_ Build Your Future", subtitle: "Job-ready courses in development, design, data and marketing — taught by people who do the work every day. Learn at your own pace, in Bangla and English." },
  mission: {
    why: "Talented people across Bangladesh miss great careers only because quality, practical training is hard to find or afford. We want skills, not luck, to decide who gets ahead.",
    what: "Affordable, project-based courses in web development, design, data, marketing and communication — with live support, real assignments and a portfolio you can show employers.",
    how: "Short lessons, weekly live sessions, instructor feedback on every assignment and a friendly community, so nobody learns alone and everybody finishes what they start.",
    imageUrl: img("photo-1523240795612-9a054b0db644"),
  },
  faqs: [
    { question: "How do I enrol in a course?", answer: "Open the course, click Enroll now, create your free account and pay online. You get access straight away — free courses unlock instantly." },
    { question: "Which payment methods can I use?", answer: "We accept bKash, Nagad, Rocket, Visa, Mastercard and net banking through SSLCommerz's secure payment page." },
    { question: "Are the classes live or recorded?", answer: "Lessons are recorded so you can learn at your own pace, and most courses add weekly live sessions for questions and code or design reviews." },
    { question: "What if I miss a live session?", answer: "Every live session is recorded and added to the course within a day, so you never miss anything." },
    { question: "Do I need any experience?", answer: "Beginner courses start from zero. Each course page lists its requirements so you know exactly what you need before you enrol." },
    { question: "Will I get a certificate?", answer: "Yes — finish all lessons and assignments to receive a certificate with a unique ID that employers can verify online." },
    { question: "Can I study on my phone?", answer: "Yes. The website works on any phone, tablet or computer, and your progress is saved across devices." },
    { question: "What is the refund policy?", answer: "If a course isn't right for you, contact us within 7 days of purchase and before completing 30% of it for a full refund." },
  ],
  officeHours: "Saturday – Thursday, 10:00 AM – 7:00 PM",
  newsletter: { enabled: true, title: "Get new courses & offers first", text: "One short email a month: new courses, free live classes and early-bird discounts. No spam, unsubscribe anytime." },
};

async function main() {
  const args = process.argv.slice(2);
  const remove = args.includes("--remove");
  const slug = args.find((a) => !a.startsWith("--")) ?? "edupro-academy";
  const demoPassword = args.find((a) => a.startsWith("--password="))?.slice("--password=".length) ?? "";
  if (demoPassword && demoPassword.length < 8) throw new Error("--password must be at least 8 characters");
  const prisma = new PrismaService();
  try {
    const inst = await prisma.institution.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!inst) throw new Error(`No academy with slug "${slug}"`);

    // Always clear previous samples first (makes the add idempotent).
    const sampleSite = await prisma.academySite.findUnique({ where: { institutionId: inst.id } });
    const siteIsSample = !!sampleSite && (sampleSite.content as Record<string, unknown> | null)?._sample === true;
    if (siteIsSample) await prisma.academySite.delete({ where: { institutionId: inst.id } });
    const sampleCourses = (await prisma.course.findMany({ where: { institutionId: inst.id, slug: { startsWith: "sample-" } }, select: { id: true } })).map((c) => c.id);
    const threads = (await prisma.discussion.findMany({ where: { courseId: { in: sampleCourses } }, select: { id: true } })).map((d) => d.id);
    await prisma.discussionReply.deleteMany({ where: { discussionId: { in: threads } } });
    await prisma.discussion.deleteMany({ where: { id: { in: threads } } });
    const del = await prisma.course.deleteMany({ where: { institutionId: inst.id, slug: { startsWith: "sample-" } } });
    await prisma.category.deleteMany({ where: { institutionId: inst.id, slug: { startsWith: "sample-" } } });
    const users = await prisma.user.deleteMany({ where: { email: { endsWith: DOMAIN } } });
    if (remove) {
      console.log(`Removed ${del.count} sample courses, ${users.count} sample users${siteIsSample ? " and the sample website content" : ""} from ${inst.name}.`);
      return;
    }

    const password = await bcrypt.hash(demoPassword || randomBytes(24).toString("hex"), 10);
    const cats = new Map<string, string>();
    for (const c of CATEGORIES) cats.set(c.slug, (await prisma.category.create({ data: { ...c, institutionId: inst.id, status: "ACTIVE" } })).id);

    const teachers = new Map<Teacher, string>();
    for (const [key, t] of Object.entries(INSTRUCTORS) as [Teacher, (typeof INSTRUCTORS)[Teacher]][]) {
      const row = await prisma.user.create({
        data: { name: t.name, email: `${key}.instructor${DOMAIN}`, password, role: "TEACHER", status: "ACTIVE", emailVerified: true, avatar: t.avatar, headline: t.headline, expertise: t.expertise, bio: t.bio, institutionId: inst.id },
      });
      teachers.set(key, row.id);
    }
    const learners: string[] = [];
    for (const name of LEARNERS) {
      const row = await prisma.user.create({ data: { name, email: `${name.toLowerCase().replace(/\s+/g, ".")}${DOMAIN}`, password, role: "STUDENT", status: "ACTIVE", emailVerified: true, institutionId: inst.id } });
      learners.push(row.id);
    }

    for (const c of COURSES) {
      const minutes = c.modules.flatMap(([, ls]) => ls).reduce((s, l) => s + l[2], 0);
      const avg = c.reviews.reduce((s, r) => s + r[1], 0) / c.reviews.length;
      const course = await prisma.course.create({
        data: {
          title: c.title,
          slug: c.slug,
          institutionId: inst.id,
          description: `<p>${c.short}</p><p>${c.about}</p><h3>Who this course is for</h3><ul><li>Learners who want a clear, structured path with real projects</li><li>Anyone preparing for a job, freelancing or their own business</li></ul><p><em>This is a sample course created to preview the academy website.</em></p>`,
          shortDescription: c.short,
          thumbnail: c.image,
          categoryId: cats.get(c.category)!,
          instructorId: teachers.get(c.teacher)!,
          level: c.level,
          language: "Bangla & English",
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
      let v = 0;
      for (const [mi, [title, lessons]] of c.modules.entries()) {
        const mod = await prisma.courseModule.create({ data: { courseId: course.id, title, order: mi + 1, durationMinutes: lessons.reduce((s, l) => s + l[2], 0) } });
        for (const [li, [t, type, durationMinutes, preview]] of lessons.entries()) {
          const lesson = await prisma.lesson.create({
            data: {
              courseId: course.id,
              moduleId: mod.id,
              title: t,
              type,
              durationMinutes,
              order: li + 1,
              isPreview: !!preview,
              status: "PUBLISHED",
              content: lessonBody(t, type, c.title),
              videoUrl: type === "VIDEO" ? VIDEOS[v++ % VIDEOS.length] : null,
            },
          });
          if (type !== "QUIZ" || !QUIZZES[c.slug]) continue;
          const qs = QUIZZES[c.slug];
          await prisma.quiz.create({
            data: {
              institutionId: inst.id,
              courseId: course.id,
              moduleId: mod.id,
              lessonId: lesson.id,
              title: t,
              description: `Check what you learned in "${title}".`,
              instructionsHtml: "<p>Answer every question, then submit. You can try again if you don't pass.</p>",
              passingScore: Math.ceil(qs.length * 10 * 0.6),
              totalMarks: qs.length * 10,
              status: "PUBLISHED",
              showImmediately: true,
              showCorrectAnswers: true,
              showExplanation: true,
              createdByName: INSTRUCTORS[c.teacher].name,
              questions: {
                create: qs.map((q, qi) => {
                  const options = q.options.map((text, oi) => ({ id: `o${oi + 1}`, text }));
                  return {
                    questionText: q.text,
                    questionType: q.kind,
                    options: JSON.stringify(options),
                    correctAnswer: "",
                    correctOptionIds: q.correct.map((i) => options[i].id),
                    marks: 10,
                    explanation: q.explanation,
                    order: qi + 1,
                  };
                }),
              },
            },
          });
        }
      }
      await prisma.courseReview.createMany({ data: c.reviews.map(([who, rating, reviewText]) => ({ courseId: course.id, userId: learners[who], rating, reviewText, status: "APPROVED" })) });
      // Reviewers are enrolled learners (some progress), and one of them asked a question in the course discussion.
      const reviewers = [...new Set(c.reviews.map(([who]) => who))];
      await prisma.enrollment.createMany({
        data: reviewers.map((who, i) => ({ userId: learners[who], courseId: course.id, status: "ACTIVE", progressPercentage: [100, 60, 35, 80][i % 4], completedAt: i % 4 === 0 ? new Date() : null, lastAccessedAt: new Date(Date.now() - i * 86_400_000) })),
        skipDuplicates: true,
      });
      await prisma.discussion.create({
        data: { institutionId: inst.id, courseId: course.id, userId: learners[reviewers[reviewers.length - 1]], title: `Question about "${c.modules[0][0]}"`, body: "<p>Could you share an extra example for this part? I want to make sure I understood it.</p>", category: "QUESTION" },
      });
    }

    // Website content — never overwrite an academy's own (non-sample) content.
    const keptOwn = !!sampleSite && !siteIsSample;
    if (!keptOwn) await prisma.academySite.create({ data: { institutionId: inst.id, content: SITE } });

    console.log(
      `Added ${COURSES.length} sample courses, ${Object.keys(INSTRUCTORS).length} instructors and ${LEARNERS.length} learners to ${inst.name}` +
        (keptOwn ? " (kept the academy's own website content)" : " plus sample website content") +
        ". Remove with --remove." +
        (demoPassword ? ` Sign-in emails: ${Object.keys(INSTRUCTORS).map((k) => `${k}.instructor${DOMAIN}`).join(", ")} (panel) and e.g. rafiq.ahmed${DOMAIN} (academy site).` : ""),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
