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

type SparticuzChromiumDefault = {
  args: string[];
  executablePath: string | ((input?: string) => string | Promise<string>);
};

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

function normalizePuppeteerModule(module: unknown): PuppeteerModule | null {
  const candidate = isRecord(module) ? (module.default ?? module) : module;
  if (isRecord(candidate) && typeof candidate.launch === "function") {
    return candidate as PuppeteerModule;
  }
  return null;
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

function describeRuntimeValueType(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function isSparticuzChromiumDefault(
  value: unknown,
): value is SparticuzChromiumDefault {
  return (
    isRecord(value) &&
    Array.isArray(value.args) &&
    value.args.every((arg) => typeof arg === "string") &&
    (typeof value.executablePath === "string" ||
      typeof value.executablePath === "function")
  );
}

function logInvalidChromiumDefaultExportShape(chromiumModule: unknown) {
  const chromiumDefault = isRecord(chromiumModule)
    ? chromiumModule.default
    : undefined;
  console.error("Browser PDF invalid @sparticuz/chromium default export shape", {
    chromiumModuleKeys: isRecord(chromiumModule)
      ? Object.keys(chromiumModule)
      : [],
    defaultType: typeof chromiumDefault,
    defaultKeys: isRecord(chromiumDefault) ? Object.keys(chromiumDefault) : [],
    argsType: isRecord(chromiumDefault)
      ? describeRuntimeValueType(chromiumDefault.args)
      : "missing",
    executablePathType: isRecord(chromiumDefault)
      ? typeof chromiumDefault.executablePath
      : "missing",
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

async function resolveChromiumExecutablePath(
  executablePathExport: SparticuzChromiumDefault["executablePath"],
) {
  const executablePath =
    typeof executablePathExport === "function"
      ? await executablePathExport()
      : executablePathExport;

  if (typeof executablePath !== "string" || !executablePath) {
    throw new Error("No Chrome executable path was resolved.");
  }

  return executablePath;
}

function logResolvedChromiumRuntime(runtime: ChromiumRuntime) {
  console.info("Browser PDF resolved Chromium runtime", {
    executablePathLength: runtime.executablePath.length,
    argsCount: runtime.args.length,
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

async function loadBrowserDependencies(): Promise<{
  puppeteer: PuppeteerModule;
  sparticuzChromium: ChromiumRuntime;
}> {
  let puppeteer: PuppeteerModule | null = null;
  try {
    const puppeteerModule = await import("puppeteer-core");
    puppeteer = normalizePuppeteerModule(puppeteerModule);
  } catch (error) {
    logBrowserPdfFailure("puppeteer-core import", error);
    throw new BrowserPdfDependencyError(
      "Browser PDF rendering could not load puppeteer-core.",
      "puppeteer-core",
      "puppeteer-core import",
      { cause: error },
    );
  }

  let chromiumModule: unknown;
  let chromium: SparticuzChromiumDefault;
  try {
    chromiumModule = await import("@sparticuz/chromium");
    const chromiumDefault = isRecord(chromiumModule)
      ? chromiumModule.default
      : undefined;

    if (!isSparticuzChromiumDefault(chromiumDefault)) {
      logInvalidChromiumDefaultExportShape(chromiumModule);
      throw new Error(
        "@sparticuz/chromium default export did not expose args and executablePath.",
      );
    }

    chromium = chromiumDefault;
  } catch (error) {
    logBrowserPdfFailure("@sparticuz/chromium import", error);
    throw new BrowserPdfDependencyError(
      "Browser PDF rendering could not load @sparticuz/chromium.",
      "@sparticuz/chromium",
      "@sparticuz/chromium import",
      { cause: error },
    );
  }

  if (!puppeteer) {
    const error = new Error("puppeteer-core did not expose a launch function.");
    logBrowserPdfFailure("puppeteer-core import", error);
    throw new BrowserPdfDependencyError(
      error.message,
      "puppeteer-core",
      "puppeteer-core import",
      { cause: error },
    );
  }

  let executablePath: string;
  try {
    executablePath = await resolveChromiumExecutablePath(
      chromium.executablePath,
    );
  } catch (error) {
    logBrowserPdfFailure("executablePath resolution", error);
    throw new BrowserPdfRuntimeError(
      "executablePath resolution",
      "Browser PDF rendering could not resolve a Chrome executable path.",
      { cause: error },
    );
  }

  const sparticuzChromium = {
    args: chromium.args,
    executablePath,
  };

  logResolvedChromiumRuntime(sparticuzChromium);

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
