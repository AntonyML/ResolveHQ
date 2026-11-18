import { importPKCS8, SignJWT } from "jose";
import type { Notice } from "./cycles";
import type { AppBindings } from "../types";
import { HttpError } from "../http/errors";

export type ShellSupportLink = {
  label: string;
  url: string;
  kind?: string;
};

export type ShellConfig = {
  revision: string;
  support: {
    title: string;
    area_name: string;
    description?: string;
    temporary_notice?: string;
    channels: Array<{ type: string; value: string; label?: string }>;
    links: ShellSupportLink[];
  };
};

export type StatePayload = {
  iss: string;
  aud: string;
  sub: string;
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  protocol_version: 1;
  server_time: string;
  cache_until: string;
  cacheMaxAgeSeconds: number;
  offlineGraceSeconds: number;
  requiredTermsVersion?: string;
  termsUrl: string;
  privacyUrl: string;
  contact: { name: string; ticket_url: string };
  notices: Notice[];
  config?: ShellConfig;
};

export class StateSigner {
  constructor(private readonly env: AppBindings) {}

  async sign(input: {
    sub: string;
    protocol_version: 1;
    server_time: string;
    cache_until: string;
    contact: { name: string; ticket_url: string };
    notices: Notice[];
    config?: ShellConfig;
    cacheMaxAgeSeconds?: number;
    offlineGraceSeconds?: number;
    requiredTermsVersion?: string;
    termsUrl?: string;
    privacyUrl?: string;
  }): Promise<string> {
    const privateKeyPEM = (this.env as any).STATE_PRIVATE_KEY;
    if (!privateKeyPEM) {
      throw new HttpError(
        500,
        "signing_key_not_configured",
        "STATE_PRIVATE_KEY no está configurada en los secretos de Cloudflare.",
      );
    }

    const cacheMaxAgeSeconds = input.cacheMaxAgeSeconds ?? 259200; // 3 days
    const offlineGraceSeconds = input.offlineGraceSeconds ?? 1209600; // 14 days
    const termsUrl = input.termsUrl ?? "https://aegisdesk.tonyml.com/legal/terms";
    const privacyUrl = input.privacyUrl ?? "https://aegisdesk.tonyml.com/legal/privacy";

    const iat = Math.floor(Date.parse(input.server_time) / 1000);
    const exp = iat + cacheMaxAgeSeconds + offlineGraceSeconds;
    const issuer = (this.env as any).STATE_ISSUER ?? "https://aegisdesk.tonyml.com";
    const keyId = (this.env as any).STATE_KEY_ID ?? "ed25519-2026-01";

    const key = await importPKCS8(privateKeyPEM, "EdDSA");
    return new SignJWT({
      protocol_version: input.protocol_version,
      server_time: input.server_time,
      cache_until: input.cache_until,
      cacheMaxAgeSeconds,
      offlineGraceSeconds,
      ...(input.requiredTermsVersion ? { requiredTermsVersion: input.requiredTermsVersion } : {}),
      termsUrl,
      privacyUrl,
      contact: input.contact,
      notices: input.notices,
      ...(input.config ? { config: input.config } : {}),
    })
      .setProtectedHeader({ alg: "EdDSA", kid: keyId, typ: "JWT" })
      .setIssuer(issuer)
      .setAudience(input.sub)
      .setSubject(input.sub)
      .setIssuedAt(iat)
      .setNotBefore(iat)
      .setExpirationTime(exp)
      .setJti(crypto.randomUUID())
      .sign(key);
  }
}
