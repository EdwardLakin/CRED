import { access } from "node:fs/promises";

export type BrowserPdfOptions = {
  url: string;
  title: string;
  cookieHeader?: string;
  timeoutMs?: number;
};

type BrowserCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
};

type BrowserPage = {
  setDefaultNavigationTimeout(timeoutMs: number): void;
  setDefaultTimeout(timeoutMs: number): void;
  setCookie(...cookies: BrowserCookie[]): Promise<void>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  emulateMediaType(mediaType: "print"): Promise<void>;
  goto(
    url: string,
    options: { waitUntil: "networkidle0"; timeout: number },
  ): Promise<unknown>;
  evaluate<Arg>(
    pageFunction: (arg: Arg) => Promise<void>,
    arg: Arg,
  ): Promise<void>;
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
    defaultViewport: {
      width: number;
      height: number;
      deviceScaleFactor: number;
    };
    executablePath: string;
    headless: boolean;
  }): Promise<Browser>;
};

type ChromiumExecutablePathExport =
  | string
  | ((input?: string) => Promise<string> | string);

type ChromiumRuntime = {
  args: string[];
  executablePath: string;
};

type BrowserPdfFailureStage =
  | "puppeteer-core import"
  | "@sparticuz/chromium import"
  | "executablePath resolution"
  | "puppeteer.launch"
  | "page.goto/html render"
  | "page.pdf";

export class BrowserPdfRuntimeError extends Error {
  constructor(
    readonly stage: BrowserPdfFailureStage,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "BrowserPdfRuntimeError";
  }
}

export class BrowserPdfDependencyError extends BrowserPdfRuntimeError {
  constructor(
    message: string,
    readonly packageName: string,
    stage: Extract<
      BrowserPdfFailureStage,
      "puppeteer-core import" | "@sparticuz/chromium import"
    >,
    options?: ErrorOptions,
  ) {
    super(stage, message, options);
    this.name = "BrowserPdfDependencyError";
  }
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

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    const code =
      isRecord(error) && typeof error.code === "string"
        ? error.code
        : undefined;
    return {
      name: error.name,
      message: error.message,
      code,
      stack: error.stack,
    };
  }
  return {
    name: "NonError",
    message: String(error),
    code: undefined,
    stack: undefined,
  };
}

function logBrowserPdfFailure(stage: BrowserPdfFailureStage, error: unknown) {
  const details = getErrorDetails(error);
  console.error("Browser PDF rendering failed", {
    stage,
    errorName: details.name,
    errorMessage: details.message,
    errorCode: details.code,
    stack: details.stack,
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

function describeExecutablePath(value: unknown) {
  if (typeof value === "function") return "function";
  if (typeof value === "string") return "string";
  return "missing";
}

let hasLoggedBrowserRuntimeShape = false;

function logBrowserRuntimeShape(puppeteer: unknown, chromium: unknown) {
  if (hasLoggedBrowserRuntimeShape) return;
  hasLoggedBrowserRuntimeShape = true;
  const chromiumDefault = isRecord(chromium) ? chromium.default : undefined;
  const executablePath = isRecord(chromium)
    ? chromium.executablePath
    : undefined;
  const defaultExecutablePath = isRecord(chromiumDefault)
    ? chromiumDefault.executablePath
    : undefined;
  console.info("Browser PDF runtime dependency shape", {
    puppeteerType: typeof puppeteer,
    chromiumExportKeys: isRecord(chromium) ? Object.keys(chromium) : [],
    executablePathType: describeExecutablePath(executablePath),
    defaultExecutablePathType: describeExecutablePath(defaultExecutablePath),
    chromiumArgsType: Array.isArray(
      isRecord(chromium) ? chromium.args : undefined,
    )
      ? "array"
      : "missing",
    defaultChromiumArgsType: Array.isArray(
      isRecord(chromiumDefault) ? chromiumDefault.args : undefined,
    )
      ? "array"
      : "missing",
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

function getChromiumExportKeys(chromium: unknown) {
  return isRecord(chromium) ? Object.keys(chromium) : [];
}

function isChromiumExecutablePathExport(
  value: unknown,
): value is ChromiumExecutablePathExport {
  return typeof value === "function" || typeof value === "string";
}

async function resolveChromiumExecutablePath(
  value: ChromiumExecutablePathExport,
) {
  const executablePath = typeof value === "function" ? await value() : value;

  if (typeof executablePath !== "string" || !executablePath) {
    throw new Error("No Chrome executable path was resolved.");
  }

  return executablePath;
}

async function resolveChromiumRuntime(
  chromium: unknown,
): Promise<ChromiumRuntime | null> {
  const candidates = [
    chromium,
    isRecord(chromium) ? chromium.default : undefined,
  ];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    if (
      Array.isArray(candidate.args) &&
      candidate.args.every((arg) => typeof arg === "string") &&
      isChromiumExecutablePathExport(candidate.executablePath)
    ) {
      const localExecutablePath = await getLocalChromeExecutablePath();
      const executablePath =
        localExecutablePath ??
        (await resolveChromiumExecutablePath(candidate.executablePath));

      return {
        args: candidate.args,
        executablePath,
      };
    }
  }
  return null;
}

function logResolvedChromiumRuntime(
  chromium: unknown,
  runtime: ChromiumRuntime,
) {
  console.info("Browser PDF resolved Chromium runtime", {
    chromiumExportKeys: getChromiumExportKeys(chromium),
    executablePathLength: runtime.executablePath.length,
    argsCount: runtime.args.length,
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

async function importBrowserPackage(packageName: string): Promise<unknown> {
  return import(packageName);
}

async function loadBrowserDependencies() {
  let puppeteer: unknown;
  try {
    puppeteer = await importBrowserPackage("puppeteer-core");
  } catch (error) {
    logBrowserPdfFailure("puppeteer-core import", error);
    throw new BrowserPdfDependencyError(
      "Browser PDF rendering could not load puppeteer-core.",
      "puppeteer-core",
      "puppeteer-core import",
      { cause: error },
    );
  }

  let chromium: unknown;
  try {
    chromium = await importBrowserPackage("@sparticuz/chromium");
  } catch (error) {
    logBrowserPdfFailure("@sparticuz/chromium import", error);
    throw new BrowserPdfDependencyError(
      "Browser PDF rendering could not load @sparticuz/chromium.",
      "@sparticuz/chromium",
      "@sparticuz/chromium import",
      { cause: error },
    );
  }

  logBrowserRuntimeShape(puppeteer, chromium);

  if (!isPuppeteerModule(puppeteer)) {
    const error = new Error("puppeteer-core did not expose a launch function.");
    logBrowserPdfFailure("puppeteer-core import", error);
    throw new BrowserPdfDependencyError(
      error.message,
      "puppeteer-core",
      "puppeteer-core import",
      { cause: error },
    );
  }

  let sparticuzChromium: ChromiumRuntime | null;
  try {
    sparticuzChromium = await resolveChromiumRuntime(chromium);
  } catch (error) {
    logBrowserPdfFailure("executablePath resolution", error);
    throw new BrowserPdfRuntimeError(
      "executablePath resolution",
      "Browser PDF rendering could not resolve a Chrome executable path.",
      { cause: error },
    );
  }

  if (!sparticuzChromium) {
    const error = new Error(
      "@sparticuz/chromium did not expose args and executablePath on its runtime export.",
    );
    logBrowserPdfFailure("@sparticuz/chromium import", error);
    throw new BrowserPdfDependencyError(
      error.message,
      "@sparticuz/chromium",
      "@sparticuz/chromium import",
      { cause: error },
    );
  }

  logResolvedChromiumRuntime(chromium, sparticuzChromium);

  return { puppeteer, sparticuzChromium };
}

async function waitForImages(page: BrowserPage, timeoutMs: number) {
  await page.evaluate(async (imageTimeoutMs: number) => {
    const images = Array.from(document.images);
    await Promise.all(
      images.map((image) => {
        if (image.complete && image.naturalWidth > 0) return Promise.resolve();
        return new Promise<void>((resolve) => {
          const timer = window.setTimeout(resolve, imageTimeoutMs);
          image.addEventListener(
            "load",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
          image.addEventListener(
            "error",
            () => {
              window.clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      }),
    );
    await (document.fonts?.ready ?? Promise.resolve());
  }, timeoutMs);
}

export async function renderPrintableReportPdf(options: BrowserPdfOptions) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const { puppeteer, sparticuzChromium } = await loadBrowserDependencies();

  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      args: sparticuzChromium.args,
      defaultViewport: { width: 1280, height: 1800, deviceScaleFactor: 1 },
      executablePath: sparticuzChromium.executablePath,
      headless: true,
    });
  } catch (error) {
    logBrowserPdfFailure("puppeteer.launch", error);
    throw new BrowserPdfRuntimeError(
      "puppeteer.launch",
      "Browser PDF rendering could not launch Chromium.",
      { cause: error },
    );
  }

  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    page.setDefaultTimeout(timeoutMs);
    if (options.cookieHeader) {
      await page.setCookie(...parseCookies(options.cookieHeader, options.url));
      await page.setExtraHTTPHeaders({ cookie: options.cookieHeader });
    }
    await page.emulateMediaType("print");
    try {
      await page.goto(options.url, {
        waitUntil: "networkidle0",
        timeout: timeoutMs,
      });
      await waitForImages(page, Math.min(10_000, timeoutMs));
    } catch (error) {
      logBrowserPdfFailure("page.goto/html render", error);
      throw new BrowserPdfRuntimeError(
        "page.goto/html render",
        "Browser PDF rendering could not load the printable report HTML.",
        { cause: error },
      );
    }
    try {
      return Buffer.from(
        await page.pdf({
          format: "Letter",
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
          tagged: true,
          outline: false,
        }),
      );
    } catch (error) {
      logBrowserPdfFailure("page.pdf", error);
      throw new BrowserPdfRuntimeError(
        "page.pdf",
        "Browser PDF rendering could not generate a PDF from the printable report page.",
        { cause: error },
      );
    }
  } finally {
    await browser.close();
  }
}
