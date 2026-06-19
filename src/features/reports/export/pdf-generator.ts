import { access } from "node:fs/promises";

export type BrowserPdfOptions = {
  url: string;
  title: string;
  cookieHeader?: string;
  timeoutMs?: number;
};

type PuppeteerModule = typeof import("puppeteer-core");
type ChromiumModule = typeof import("@sparticuz/chromium");
type BrowserPage = import("puppeteer-core").Page;

async function getLocalChromeExecutablePath() {
  const candidates = [
    process.env.CHROME_EXECUTABLE_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue looking for a local browser binary.
    }
  }
  return null;
}

function parseCookies(cookieHeader: string, url: string) {
  const { hostname } = new URL(url);
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      const name = separator >= 0 ? part.slice(0, separator).trim() : part;
      const value = separator >= 0 ? part.slice(separator + 1).trim() : "";
      return { name, value, domain: hostname, path: "/" };
    })
    .filter((cookie) => cookie.name);
}

async function loadBrowserDependencies() {
  try {
    const [puppeteer, chromium] = await Promise.all([
      (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<PuppeteerModule>)("puppeteer-core"),
      (new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<ChromiumModule>)("@sparticuz/chromium"),
    ]);
    return { puppeteer, chromium };
  } catch (error) {
    throw new Error(
      "Browser PDF rendering requires puppeteer-core and @sparticuz/chromium to be installed.",
      { cause: error },
    );
  }
}

async function waitForImages(page: BrowserPage, timeoutMs: number) {
  await page.evaluate(async (imageTimeoutMs: number) => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, imageTimeoutMs);
          image.addEventListener("load", () => { window.clearTimeout(timer); resolve(); }, { once: true });
          image.addEventListener("error", () => { window.clearTimeout(timer); resolve(); }, { once: true });
        });
      }),
    );
    await (document.fonts?.ready ?? Promise.resolve());
  }, timeoutMs);
}

export async function renderPrintableReportPdf(options: BrowserPdfOptions) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const { puppeteer, chromium } = await loadBrowserDependencies();
  const localExecutablePath = await getLocalChromeExecutablePath();
  const executablePath = localExecutablePath ?? await chromium.executablePath();

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 1 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    page.setDefaultTimeout(timeoutMs);
    if (options.cookieHeader) {
      await page.setCookie(...parseCookies(options.cookieHeader, options.url));
      await page.setExtraHTTPHeaders({ cookie: options.cookieHeader });
    }
    await page.emulateMediaType("print");
    await page.goto(options.url, { waitUntil: "networkidle0", timeout: timeoutMs });
    await waitForImages(page, Math.min(10_000, timeoutMs));
    return Buffer.from(await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      tagged: true,
      outline: false,
    }));
  } finally {
    await browser.close();
  }
}
