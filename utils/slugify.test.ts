import { describe, expect, it } from "vite-plus/test";
import { slugify } from "./slugify";

describe("slugify", () => {
  it("converts umlauts and spaces", () => {
    expect(slugify("VC Müllheim")).toBe("vc-muellheim");
    expect(slugify("Markgräfler Volleys")).toBe("markgraefler-volleys");
  });
});
