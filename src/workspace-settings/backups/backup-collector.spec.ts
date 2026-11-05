import { schemaModels } from "./backup-collector";

describe("backup collector · schema reader", () => {
  const models = new Map(schemaModels().map((m) => [m.name, m]));
  it("reads ids, scalar columns and single-column foreign keys", () => {
    const mod = models.get("CourseModule")!;
    expect(mod.id).toBe("id");
    expect(mod.scalars).toEqual(expect.arrayContaining(["id", "courseId", "title", "order"]));
    expect(mod.relations).toContainEqual({ fk: "courseId", target: "Course" });
    expect(models.get("Lesson")!.relations).toContainEqual({ fk: "moduleId", target: "CourseModule" });
    expect(models.get("User")!.scalars).toContain("password");
  });
  it("knows every model, the backup table included", () => {
    expect(models.size).toBeGreaterThan(50);
    expect(models.has("WorkspaceBackup")).toBe(true);
  });
});
