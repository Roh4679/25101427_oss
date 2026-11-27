import { UserError } from "../../config.js";

// playwright·@axe-core/playwright는 선택 설치(optional peer dependency)다. --live일 때만 불러온다 (cli.md 6장).

export const INSTALL_HINT =
  "--live에는 playwright와 @axe-core/playwright가 필요합니다. `npm i -D playwright @axe-core/playwright` 후 `npx playwright install chromium`을 실행하세요.";
export const BROWSER_HINT = "렌더링에 쓸 브라우저를 찾지 못했습니다. `npx playwright install chromium`을 실행하거나 Chrome을 설치하세요.";

type Playwright = typeof import("playwright");
type AxeModule = typeof import("@axe-core/playwright");
export type Browser = Awaited<ReturnType<Playwright["chromium"]["launch"]>>;

export interface LiveTools {
  playwright: Playwright;
  AxeBuilder: AxeModule["default"];
}

// 패키지 이름은 변수로 넘겨 번들러·타입 검사가 필수 의존성으로 보지 않게 한다
export async function loadLiveTools(importer: (name: string) => Promise<unknown> = (n) => import(n)): Promise<LiveTools> {
  try {
    const playwright = (await importer("playwright")) as Playwright;
    const axe = (await importer("@axe-core/playwright")) as AxeModule;
    return { playwright, AxeBuilder: axe.default };
  } catch {
    throw new UserError(INSTALL_HINT);
  }
}

// Playwright Chromium → 설치된 Chrome → Edge 순서로 실행해 본다
export async function launchBrowser(tools: LiveTools): Promise<Browser> {
  for (const options of [{}, { channel: "chrome" }, { channel: "msedge" }]) {
    try {
      return await tools.playwright.chromium.launch(options);
    } catch {
      // 다음 후보
    }
  }
  throw new UserError(BROWSER_HINT);
}
