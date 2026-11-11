import type { AcademySiteContent } from "./academy-site.types";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const url = (v: unknown) => {
  const s = str(v, 500);
  return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : "";
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/**
 * Normalises stored website content into the public shape: unknown keys dropped, strings trimmed and capped,
 * links https-only, empty blocks → null. The admin editor (Settings › Website) writes through the same function.
 */
export function toSiteContent(raw: unknown): AcademySiteContent {
  const c = obj(raw);
  const hero = obj(c.hero);
  const mission = obj(c.mission);
  const app = obj(c.app);
  const socials = obj(c.socials);
  const news = obj(c.newsletter);

  const heroOut = { title: str(hero.title, 80), subtitle: str(hero.subtitle, 240) };
  const missionOut = { why: str(mission.why, 600), what: str(mission.what, 600), how: str(mission.how, 600), imageUrl: url(mission.imageUrl) };
  const appOut = { title: str(app.title, 80), text: str(app.text, 300), appStoreUrl: url(app.appStoreUrl), playStoreUrl: url(app.playStoreUrl), screenshotUrl: url(app.screenshotUrl) };

  return {
    hero: heroOut.title || heroOut.subtitle ? heroOut : null,
    mission: missionOut.why || missionOut.what || missionOut.how ? missionOut : null,
    app: appOut.appStoreUrl || appOut.playStoreUrl ? appOut : null,
    faqs: (Array.isArray(c.faqs) ? c.faqs : [])
      .map((f) => ({ question: str(obj(f).question, 200), answer: str(obj(f).answer, 1200) }))
      .filter((f) => f.question && f.answer)
      .slice(0, 20),
    socials: { facebook: url(socials.facebook), instagram: url(socials.instagram), youtube: url(socials.youtube), linkedin: url(socials.linkedin), tiktok: url(socials.tiktok) },
    newsletter: { enabled: news.enabled !== false, title: str(news.title, 80), text: str(news.text, 240) },
  };
}
