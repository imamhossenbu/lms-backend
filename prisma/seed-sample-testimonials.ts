/**
 * Adds SAMPLE testimonials for the marketing website while there are no real ones yet.
 * People and institutions are fictional; avatars are illustrated (DiceBear "Notionists", CC0).
 * Replace them with real customer quotes (Owner Console › Testimonials) before launch.
 *
 *   npx ts-node --transpile-only prisma/seed-sample-testimonials.ts          # add / refresh
 *   npx ts-node --transpile-only prisma/seed-sample-testimonials.ts --remove # delete the samples
 *
 * Idempotent: samples are matched by name and updated in place.
 */
import "dotenv/config";
import { PrismaService } from "../src/prisma/prisma.service";

const avatar = (seed: string) => `https://api.dicebear.com/9.x/notionists/png?seed=${encodeURIComponent(seed)}&size=128&backgroundColor=ffe2cc,dbeafe,dcfce7,fef3c7`;

const SAMPLES = [
  {
    name: "Farhana Rahman",
    role: "Principal, Green Valley School, Sylhet",
    quote: "We moved admissions, classes and exam results onto EduPro in one term. Parents now see progress without calling the office, and our teachers save hours every week.",
    featured: true,
  },
  {
    name: "Tanvir Hasan",
    role: "Founder, Pathshala Coaching Centre, Dhaka",
    quote: "Live classes, quizzes and bKash payments in one dashboard. Our batch sizes doubled and we stopped juggling five different tools.",
  },
  {
    name: "Nusrat Jahan",
    role: "Academic Coordinator, Bright Minds Academy, Chattogram",
    quote: "Certificates are issued automatically when students finish a course. It feels professional, and students share them proudly.",
  },
  {
    name: "Mahmudul Karim",
    role: "Director, SkillUp Training Institute, Rajshahi",
    quote: "Setting up our first course took an afternoon. The analytics show exactly which lessons students drop off, so we fix them quickly.",
  },
  {
    name: "Sadia Islam",
    role: "Head Teacher, Nur Madrasa, Khulna",
    quote: "Our teachers are not tech experts, yet everyone runs their own classes now. Support answered every question patiently, in plain language.",
  },
  {
    name: "Arif Chowdhury",
    role: "Owner, Admission Care, Mymensingh",
    quote: "Mock tests with instant results changed how we prepare students for admission exams. Attempt history makes one-to-one feedback easy.",
  },
];

(async () => {
  const p: any = new PrismaService();
  const names = SAMPLES.map((s) => s.name);
  try {
    if (process.argv.includes("--remove")) {
      const { count } = await p.testimonial.deleteMany({ where: { name: { in: names } } });
      console.log(`removed ${count} sample testimonials`);
      return;
    }
    for (const [i, s] of SAMPLES.entries()) {
      const data = { quote: s.quote, role: s.role, avatarUrl: avatar(s.name), featured: !!s.featured, isPublished: true, order: i + 1 };
      const existing = await p.testimonial.findFirst({ where: { name: s.name } });
      if (existing) await p.testimonial.update({ where: { id: existing.id }, data });
      else await p.testimonial.create({ data: { name: s.name, ...data } });
    }
    console.log(`seeded ${SAMPLES.length} sample testimonials`);
  } finally {
    await p.$disconnect();
  }
})();
