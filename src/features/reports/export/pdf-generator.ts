import { access } from "node:fs/promises";

export type BrowserPdfOptions = {
  url: string;
  title: string;
  cookieHeader?: string;
  timeoutMs?: number;
};

type BrowserCookie = { name: string; value: string; domain: string; path: string };

type BrowserPage = {
  setDefaultNavigationTimeout(timeoutMs: number): void;
  setDefaultTimeout(timeoutMs: number): void;
  setCookie(...cookies: BrowserCookie[]): Promise<void>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  emulateMediaType(mediaType: "print"): Promise<void>;
  goto(url: string, options: { waitUntil: "networkidle0"; timeout: number }): Promise<unknown>;
  evaluate<Arg>(pageFunction: (arg: Arg) => Promise<void>, arg: Arg): Promise<void>;
  pdf(options: {
    format: "Letter";
    printBackground: boolean;
    preferCSSPageSize: boolean;
    displayHeaderFooter: boolean;
    tagged: boolean;
    outline: boolean;
  }): Promise<Uint8Array>;
};

type Browser = {
  newPage(): Promise<BrowserPage>;
  close(): Promise<void>;
};

type PuppeteerModule = {
  launch(options: {
    args: string[];
    defaultViewport: { width: number; height: number; deviceScaleFactor: number };
    executablePath: string;
    headless: boolean;
  }): Promise<Browser>;
};

type ChromiumDefaultExport = {
  args: string[];
  executablePath(input?: string): Promise<string>;
};

type ChromiumModule = {
  default: ChromiumDefaultExport;
};

export class BrowserPdfDependencyError extends Error {
  constructor(
    message: string,
    readonly packageName: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserPdfDependencyError";
  }
}

function getMissingBrowserPackage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("puppeteer-core")) return "puppeteer-core";
  if (message.includes("@sparticuz/chromium")) return "@sparticuz/chromium";
  return "unknown";
}

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPuppeteerModule(value: unknown): value is PuppeteerModule {
  return isRecord(value) && typeof value.launch === "function";
}

function isChromiumDefaultExport(value: unknown): value is ChromiumDefaultExport {
  return (
    isRecord(value)
    && Array.isArray(value.args)
    && value.args.every((arg) => typeof arg === "string")
    && typeof value.executablePath === "function"
  );
}

function isChromiumModule(value: unknown): value is ChromiumModule {
  return isRecord(value) && isChromiumDefaultExport(value.default);
}

async function importBrowserPackage(packageName: string): Promise<unknown> {
  return import(packageName);
}

async function loadBrowserDependencies() {
  try {
    const [puppeteer, chromium] = await Promise.all([
      importBrowserPackage("puppeteer-core"),
      importBrowserPackage("@sparticuz/chromium"),
    ]);
    if (!isPuppeteerModule(puppeteer) || !isChromiumModule(chromium)) {
      throw new Error("Browser PDF dependencies did not expose the expected runtime APIs.");
    }
    return { puppeteer, chromium };
  } catch (error) {
    throw new BrowserPdfDependencyError(
      "Browser PDF rendering requires puppeteer-core and @sparticuz/chromium to be installed.",
      getMissingBrowserPackage(error),
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
  const sparticuzChromium = chromium.default;
  const localExecutablePath = await getLocalChromeExecutablePath();
  const executablePath = localExecutablePath ?? await sparticuzChromium.executablePath();

  const browser = await puppeteer.launch({
    args: sparticuzChromium.args,
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
