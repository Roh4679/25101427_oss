import type { Service } from "../knowledge/services.js";
import type { Detector } from "../types.js";
import { globToRegExp } from "./files.js";
import { CODE_FILE, readPackageJson } from "./project.js";

// "*.supabase.co" → ".supabase.co" 포함, "@vercel/*" → 접두어
const packageMatches = (pattern: string, dep: string) => (pattern.endsWith("*") ? dep.startsWith(pattern.slice(0, -1)) : dep === pattern);
const hostNeedle = (host: string) => (host.startsWith("*.") ? host.slice(1) : host);

// 대응표는 지식 베이스 데이터로 받는다 (코드에 서비스 목록을 두지 않는다).
export function servicesDetector(table: Service[]): Detector {
  return {
    id: "services",
    detect(ctx) {
      const pkg = readPackageJson(ctx.files);
      const deps = [...Object.keys(pkg?.dependencies ?? {}), ...Object.keys(pkg?.devDependencies ?? {})];
      const code = ctx.files.filter((f) => CODE_FILE.test(f.path) && f.content !== undefined);
      const used = table.filter(
        (s) =>
          (s.packages ?? []).some((p) => deps.some((d) => packageMatches(p, d))) ||
          (s.hosts ?? []).some((h) => code.some((f) => f.content!.includes(hostNeedle(h)))) ||
          (s.files ?? []).map(globToRegExp).some((re) => ctx.files.some((f) => re.test(f.path))),
      );
      return [{ key: "overseas_services", value: used.map((s) => s.name) }];
    },
  };
}
