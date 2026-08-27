export type ExistingLogo = {
  logoImageLink?: string;
  logoS3Key?: string;
};

export type ResolvedLogo = {
  logoImageLink?: string;
  shouldUpload: boolean;
  existingS3Key?: string;
};

/**
 * Paginated SAMS club lists often return `logoImageLink: null` even when a logo exists.
 * Keep the previously stored URL/key unless the API returns a fresh URL.
 */
export function resolveClubLogo(args: {
  incomingLogoUrl: string | null | undefined;
  existing?: ExistingLogo;
}): ResolvedLogo {
  const incoming = args.incomingLogoUrl?.trim() || undefined;
  if (incoming) {
    return {
      logoImageLink: incoming,
      shouldUpload: true,
      existingS3Key: args.existing?.logoS3Key,
    };
  }
  return {
    logoImageLink: args.existing?.logoImageLink,
    shouldUpload: false,
    existingS3Key: args.existing?.logoS3Key,
  };
}

export function publicLogoUrl(args: {
  publicBaseUrl: string;
  logoS3Key?: string;
  fallbackImageLink?: string;
}): string | null {
  if (args.logoS3Key && args.publicBaseUrl) {
    return `${args.publicBaseUrl.replace(/\/$/, "")}/${args.logoS3Key}`;
  }
  return args.fallbackImageLink ?? null;
}

export function logoObjectKey(sportsclubUuid: string, contentType: string): string {
  const ext = contentType.includes("jpeg")
    ? "jpg"
    : contentType.includes("gif")
      ? "gif"
      : contentType.includes("webp")
        ? "webp"
        : "png";
  return `sams-logos/${sportsclubUuid}.${ext}`;
}
