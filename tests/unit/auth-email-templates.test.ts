import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { authCallbackUrl } from "@/lib/auth/callback-url";

// The shared Supabase project sends one template per email for both apps. These
// checks keep Virtual Earn's side of that contract: its callback URLs must match
// the template's prefix test, and its links must stay valid when appended to.
const TEMPLATE_DIR = path.resolve(import.meta.dirname, "../../supabase/templates/shared-project");
const TEMPLATES = { confirmation: "signup", recovery: "recovery" } as const;
const CONDITION = /\{\{- if and \(ge \(len \.RedirectTo\) (\d+)\) \(eq \(slice \.RedirectTo 0 (\d+)\) "([^"]+)"\) -\}\}/;

function read(name: string): string {
  return readFileSync(path.join(TEMPLATE_DIR, `${name}.html`), "utf8");
}

describe.each(Object.entries(TEMPLATES))("shared %s template", (name, otpType) => {
  const source = read(name);
  const match = CONDITION.exec(source);

  it("guards the prefix slice with a matching length", () => {
    expect(match).not.toBeNull();
    const [, guard, end, prefix] = match!;
    expect(Number(guard)).toBe(prefix.length);
    expect(Number(end)).toBe(prefix.length);
  });

  it("selects Virtual Earn only for Virtual Earn origins", () => {
    const prefix = match![3];
    for (const origin of ["https://virtual-earn.vercel.app", "https://virtual-earn-noobies-projects.vercel.app"]) {
      expect(authCallbackUrl("/dashboard", origin).startsWith(prefix)).toBe(true);
    }
    expect("https://iamunknown.vercel.app/auth/confirm".startsWith(prefix)).toBe(false);
  });

  it("links Virtual Earn readers to its own callback with a token hash", () => {
    const [veBranch, unknownBranch] = source.split("{{- else -}}");
    const link = `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${otpType}`;
    expect(veBranch).toContain(`href="${link}"`);
    expect(veBranch).not.toContain(".SiteURL");
    expect(unknownBranch).toContain(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${otpType}`);
  });
});

describe("authCallbackUrl", () => {
  it("always carries a query so the templates can append parameters", () => {
    const url = authCallbackUrl("/reset-password", "https://virtual-earn.vercel.app");
    expect(url).toBe("https://virtual-earn.vercel.app/auth/callback?next=%2Freset-password");
  });

  it("ignores a path on the configured app URL", () => {
    expect(authCallbackUrl("/dashboard", "https://virtual-earn.vercel.app/some/path")).toBe(
      "https://virtual-earn.vercel.app/auth/callback?next=%2Fdashboard",
    );
  });
});
