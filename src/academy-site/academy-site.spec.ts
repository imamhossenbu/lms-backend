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
