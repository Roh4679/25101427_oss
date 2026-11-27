import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { join } from "node:path";

// 렌더링 테스트용 로컬 서버. 실제 서비스를 흉내 내는 주소들:
//   /, /terms.html, /login.html     정적 파일
//   /dynamic-refund                 코드에 없고 렌더링에만 있는 페이지 (T108)
//   /gone                           404
//   /members                        302 → /login.html (로그인 리다이렉트)
//   /spa/*                          SPA: 없는 주소에도 index.html을 200으로
//   /many                           같은 origin 링크 25개 (T106)
export interface TestSite {
  url: string;
  requests: string[];
  close: () => Promise<void>;
}

const dir = import.meta.dirname;

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as { port: number }).port}`)));
}

export async function startSite(otherOrigin = "http://127.0.0.1:9"): Promise<TestSite> {
  const requests: string[] = [];
  const html = (body: string) => `<!doctype html><html lang="ko"><head><meta charset="UTF-8"><title>t</title></head><body>${body}</body></html>`;
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0]!;
    requests.push(path);
    const send = (status: number, body: string, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers });
      res.end(body);
    };
    if (path === "/" || path.startsWith("/spa/")) return send(200, readFileSync(join(dir, "index.html"), "utf8").replace("__OTHER_ORIGIN__", otherOrigin));
    if (path === "/terms.html" || path === "/login.html") return send(200, readFileSync(join(dir, path.slice(1)), "utf8"));
    if (path === "/dynamic-refund") return send(200, html("<h1>환불 안내</h1><p>결제 후 7일 이내 청약철회가 가능합니다.</p>"));
    if (path === "/members") return send(302, "", { location: "/login.html" });
    if (path === "/many") return send(200, html(Array.from({ length: 25 }, (_, i) => `<a href="/p/${i}">${i}</a>`).join(" ")));
    if (path.startsWith("/p/")) return send(200, html(`<p>페이지 ${path}</p>`));
    return send(404, html("<h1>없음</h1>"));
  });
  const url = await listen(server);
  return { url, requests, close: () => new Promise((r) => server.close(() => r())) };
}

// 다른 origin: 요청을 기록만 한다 (열리면 안 된다)
export async function startOtherOrigin(): Promise<TestSite> {
  const requests: string[] = [];
  const server = createServer((req, res) => {
    requests.push(req.url ?? "/");
    res.end("other");
  });
  const url = await listen(server);
  return { url, requests, close: () => new Promise((r) => server.close(() => r())) };
}
