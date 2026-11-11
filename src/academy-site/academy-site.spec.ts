import { levelLabel, parseList, parseTags, toCourseCard } from "./academy-site.mapper";

describe("academy-site mapper", () => {
  it("parses course text lists stored as JSON arrays or lines", () => {
    expect(parseList('["Learn A", " Learn B ", ""]')).toEqual(["Learn A", "Learn B"]);
    expect(parseList("- one\n• two\n3. three")).toEqual(["one", "two", "three"]);
    expect(parseList("[not json")).toEqual(["[not json"]);
    expect(parseList(null)).toEqual([]);
  });

  it("splits tags and labels levels", () => {
    expect(parseTags("React, , Node ")).toEqual(["React", "Node"]);
    expect(levelLabel("BEGINNER")).toBe("Beginner");
  });

  it("maps a course row to a public card", () => {
    const card = toCourseCard(
      {
        id: "c1", slug: "s", title: "T", shortDescription: "", description: "Long description", thumbnail: "", level: "advanced", language: "English",
        price: "0", isFree: false, durationMinutes: 90, ratingAverage: "4.26", totalStudents: 3,
        category: { slug: "cat", name: "Cat" },
        instructor: { id: "u1", name: "Ann", avatar: null, headline: null, expertise: "Design, UI" },
        _count: { reviews: 2, enrollments: 5 },
      },
      7,
    );
    expect(card).toMatchObject({ isFree: true, price: 0, rating: 4.3, students: 5, lessons: 7, level: "Advanced", shortDescription: "Long description", thumbnail: null });
    expect(card.instructor.headline).toBe("Design");
  });
});

import { toSiteContent } from "./site-content";

describe("academy website content", () => {
  it("drops unknown keys, trims, keeps https links only and nulls empty blocks", () => {
    const c = toSiteContent({
      _sample: true,
      evil: "<script>",
      hero: { title: "  Build_ Skills  ", subtitle: "" },
      mission: { why: "", what: "", how: "" },
      app: { appStoreUrl: "javascript:alert(1)", playStoreUrl: "" },
      faqs: [{ question: "Q?", answer: "A." }, { question: "no answer" }, "junk"],
      socials: { facebook: "https://facebook.com/x", youtube: "http://insecure.example" },
      newsletter: { title: "Hi" },
    });
    expect(c.hero).toEqual({ title: "Build_ Skills", subtitle: "" });
    expect(c.mission).toBeNull();
    expect(c.app).toBeNull();
    expect(c.faqs).toEqual([{ question: "Q?", answer: "A." }]);
    expect(c.socials.facebook).toBe("https://facebook.com/x");
    expect(c.socials.youtube).toBe("");
    expect(c.newsletter).toEqual({ enabled: true, title: "Hi", text: "" });
    expect(JSON.stringify(c)).not.toContain("evil");
  });

  it("handles missing / non-object content", () => {
    expect(toSiteContent(null).faqs).toEqual([]);
    expect(toSiteContent("x").hero).toBeNull();
  });
});
