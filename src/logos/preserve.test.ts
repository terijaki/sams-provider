import { describe, expect, it } from "vite-plus/test";
import { publicLogoUrl, resolveClubLogo } from "./preserve";

describe("logo preservation", () => {
  it("keeps the stored logo when the paginated API returns null", () => {
    const resolved = resolveClubLogo({
      incomingLogoUrl: null,
      existing: {
        logoImageLink: "https://sams.example/logo.png",
        logoS3Key: "sams-logos/club.png",
      },
    });
    expect(resolved.shouldUpload).toBe(false);
    expect(resolved.logoImageLink).toBe("https://sams.example/logo.png");
    expect(resolved.existingS3Key).toBe("sams-logos/club.png");
  });

  it("re-uploads when SAMS returns a fresh URL", () => {
    const resolved = resolveClubLogo({
      incomingLogoUrl: "https://sams.example/new.png",
      existing: { logoImageLink: "https://sams.example/old.png", logoS3Key: "sams-logos/club.png" },
    });
    expect(resolved.shouldUpload).toBe(true);
    expect(resolved.logoImageLink).toBe("https://sams.example/new.png");
  });

  it("prefers the mirrored public object URL", () => {
    expect(
      publicLogoUrl({
        publicBaseUrl: "https://cdn.example",
        logoS3Key: "sams-logos/club.png",
        fallbackImageLink: "https://sams.example/logo.png",
      }),
    ).toBe("https://cdn.example/sams-logos/club.png");
  });
});
