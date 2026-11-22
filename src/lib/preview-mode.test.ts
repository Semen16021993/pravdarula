import { describe, expect, it } from "vitest";
import { isProjectPreview } from "./preview-mode";

const id = "6ab06a73-9e5d-4a06-854b-efc1831a70e7";
describe("Preview-only frontend demo", () => {
  it("never bypasses frontend login on production domains", () => {
    for (const host of ["pravdarula.ru", "www.pravdarula.ru", "twelve-twenty-seven-hub.lovable.app", `project--${id}.lovable.app`]) {
      expect(isProjectPreview(host)).toBe(false);
    }
  });
  it("allows this project's embedded and built previews", () => {
    for (const host of [`${id}.lovableproject.com`, `id-preview--${id}.lovable.app`, `id-preview-6--${id}.lovable.app`, `id-preview-abc123--${id}.lovable.app`, `project--${id}-dev.lovable.app`, `live--${id}.workspace.lovable.app`, "localhost"]) {
      expect(isProjectPreview(host)).toBe(true);
    }
  });
  it("rejects unrelated projects and suffix lookalikes", () => {
    for (const host of ["other.lovableproject.com", "id-preview--other.lovable.app", `id-preview--${id}.lovable.app.evil.test`, `live--${id}.a.b.lovable.app`, "pravdarula.ru.evil.test"]) {
      expect(isProjectPreview(host)).toBe(false);
    }
  });
});