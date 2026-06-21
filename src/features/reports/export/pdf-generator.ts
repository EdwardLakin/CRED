import { existsSync } from "node:fs";
import { join } from "node:path";

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

type BrowserResponse = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  request(): { resourceType(): string };
};

type BrowserRequest = {
  url(): string;
  resourceType(): string;
  failure(): { errorText: string } | null;
};

type BrowserConsoleMessage = {
  type(): string;
  text(): string;
};

type BrowserPage = {
  on(event: "response", handler: (response: BrowserResponse) => void): void;
  on(event: "requestfailed", handler: (request: BrowserRequest) => void): void;
  on(event: "pageerror", handler: (error: Error) => void): void;
  on(event: "console", handler: (message: BrowserConsoleMessage) => void): void;
  setDefaultNavigationTimeout(timeoutMs: number): void;
  setDefaultTimeout(timeoutMs: number): void;
  setCookie(...cookies: BrowserCookie[]): Promise<void>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
  emulateMediaType(mediaType: "print"): Promise<void>;
  goto(
    url: string,
    options: { waitUntil: "networkidle0"; timeout: number },
  ): Promise<unknown>;
  evaluate<Arg, Result>(
    pageFunction: (arg: Arg) => Result | Promise<Result>,
    arg?: Arg,
  ): Promise<Result>;
  metrics(): Promise<Record<string, number>>;
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

type ChromiumFactory = new () => unknown;

type ChromiumFunction = () => unknown | Promise<unknown>;

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

function isPropertyContainer(value: unknown): value is object {
  return (
    (typeof value === "object" && value !== null) || typeof value === "function"
  );
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

function describeRuntimeValueKeys(value: unknown) {
  return isRecord(value) ? Object.keys(value) : [];
}

function getChromiumCandidateRuntime(
  candidate: unknown,
): SparticuzChromiumDefault | null {
  if (!isPropertyContainer(candidate)) return null;

  const args = Reflect.get(candidate, "args");
  const executablePath = Reflect.get(candidate, "executablePath");

  if (
    Array.isArray(args) &&
    args.every((arg) => typeof arg === "string") &&
    (typeof executablePath === "string" || typeof executablePath === "function")
  ) {
    return { args, executablePath };
  }

  return null;
}

function describeChromiumCandidateShape(value: unknown) {
  const args = isPropertyContainer(value)
    ? Reflect.get(value, "args")
    : undefined;
  const executablePath = isPropertyContainer(value)
    ? Reflect.get(value, "executablePath")
    : undefined;

  return {
    keys: describeRuntimeValueKeys(value),
    ownPropertyNames: isPropertyContainer(value)
      ? Object.getOwnPropertyNames(value)
      : [],
    argsType: isPropertyContainer(value)
      ? describeRuntimeValueType(args)
      : "missing",
    executablePathType: isPropertyContainer(value)
      ? typeof executablePath
      : "missing",
    argsIsArray: Array.isArray(args),
    executablePathIsString: typeof executablePath === "string",
    executablePathIsFunction: typeof executablePath === "function",
  };
}

function logChromiumDefaultFunctionDiagnostics(
  defaultExport: object,
  resolutionStage: string,
) {
  const args = Reflect.get(defaultExport, "args");
  const executablePath = Reflect.get(defaultExport, "executablePath");

  console.info("Browser PDF @sparticuz/chromium default function diagnostics", {
    resolutionStage,
    defaultType: typeof defaultExport,
    defaultOwnPropertyNames: Object.getOwnPropertyNames(defaultExport),
    defaultArgsReflectType: describeRuntimeValueType(args),
    defaultExecutablePathReflectType: typeof executablePath,
    defaultArgsIsArray: Array.isArray(args),
    defaultExecutablePathIsString: typeof executablePath === "string",
    defaultExecutablePathIsFunction: typeof executablePath === "function",
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
}

function logInvalidChromiumDefaultExportShape(
  chromiumModule: unknown,
  functionDiagnostics?: {
    constructorSucceeded: boolean;
    constructorResult: unknown;
    directCallSucceeded: boolean;
    directCallResult: unknown;
  },
) {
  const chromiumDefault = isRecord(chromiumModule)
    ? chromiumModule.default
    : undefined;
  const defaultShape = describeChromiumCandidateShape(chromiumDefault);
  const constructedShape = describeChromiumCandidateShape(
    functionDiagnostics?.constructorResult,
  );
  const calledShape = describeChromiumCandidateShape(
    functionDiagnostics?.directCallResult,
  );
  console.error(
    "Browser PDF invalid @sparticuz/chromium default export shape",
    {
      chromiumModuleKeys: isRecord(chromiumModule)
        ? Object.keys(chromiumModule)
        : [],
      defaultType: typeof chromiumDefault,
      defaultKeys: defaultShape.keys,
      defaultOwnPropertyNames: defaultShape.ownPropertyNames,
      defaultArgsReflectType: defaultShape.argsType,
      defaultExecutablePathReflectType: defaultShape.executablePathType,
      defaultArgsIsArray: defaultShape.argsIsArray,
      defaultExecutablePathIsString: defaultShape.executablePathIsString,
      defaultExecutablePathIsFunction: defaultShape.executablePathIsFunction,
      constructorCallSucceeded: functionDiagnostics?.constructorSucceeded,
      constructorResultKeys: constructedShape.keys,
      constructorResultArgsType: constructedShape.argsType,
      constructorResultExecutablePathType: constructedShape.executablePathType,
      directFunctionCallSucceeded: functionDiagnostics?.directCallSucceeded,
      directFunctionCallResultKeys: calledShape.keys,
      directFunctionCallResultArgsType: calledShape.argsType,
      directFunctionCallResultExecutablePathType:
        calledShape.executablePathType,
      argsType: defaultShape.argsType,
      executablePathType: defaultShape.executablePathType,
      nodeEnvironment: process.env.NODE_ENV,
      vercelEnvironment: process.env.VERCEL_ENV,
    },
  );
}

function logChromiumFunctionExportResolution(diagnostics: {
  constructorSucceeded: boolean;
  constructorResult: unknown;
  directCallSucceeded: boolean;
  directCallResult: unknown;
  resolvedResult: unknown;
}) {
  const constructedShape = describeChromiumCandidateShape(
    diagnostics.constructorResult,
  );
  const calledShape = describeChromiumCandidateShape(
    diagnostics.directCallResult,
  );
  const resolvedShape = describeChromiumCandidateShape(
    diagnostics.resolvedResult,
  );
  console.info("Browser PDF resolved @sparticuz/chromium function export", {
    defaultType: "function",
    constructorCallSucceeded: diagnostics.constructorSucceeded,
    constructorResultKeys: constructedShape.keys,
    constructorResultArgsType: constructedShape.argsType,
    constructorResultExecutablePathType: constructedShape.executablePathType,
    directFunctionCallSucceeded: diagnostics.directCallSucceeded,
    directFunctionCallResultKeys: calledShape.keys,
    directFunctionCallResultArgsType: calledShape.argsType,
    directFunctionCallResultExecutablePathType: calledShape.executablePathType,
    resolvedResultKeys: resolvedShape.keys,
    argsType: resolvedShape.argsType,
    executablePathType: resolvedShape.executablePathType,
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

async function resolveSparticuzChromiumExport(
  chromiumModule: unknown,
): Promise<SparticuzChromiumDefault> {
  const chromiumDefault = isRecord(chromiumModule)
    ? chromiumModule.default
    : undefined;

  const defaultRuntime = getChromiumCandidateRuntime(chromiumDefault);
  if (defaultRuntime) {
    if (typeof chromiumDefault === "function") {
      logChromiumDefaultFunctionDiagnostics(
        chromiumDefault,
        "default export static properties",
      );
    }
    return defaultRuntime;
  }

  const moduleRuntime = getChromiumCandidateRuntime(chromiumModule);
  if (moduleRuntime) return moduleRuntime;

  if (typeof chromiumDefault === "function") {
    const chromiumFactory = chromiumDefault as ChromiumFactory;
    const chromiumFunction = chromiumDefault as ChromiumFunction;
    let constructorSucceeded = false;
    let constructorResult: unknown = undefined;
    let directCallSucceeded = false;
    let directCallResult: unknown = undefined;

    try {
      constructorResult = new chromiumFactory();
      constructorSucceeded = true;
      const constructorRuntime = getChromiumCandidateRuntime(constructorResult);
      if (constructorRuntime) {
        logChromiumFunctionExportResolution({
          constructorSucceeded,
          constructorResult,
          directCallSucceeded,
          directCallResult,
          resolvedResult: constructorResult,
        });
        return constructorRuntime;
      }
    } catch (error) {
      constructorResult = error;
    }

    try {
      directCallResult = await chromiumFunction();
      directCallSucceeded = true;
      const directCallRuntime = getChromiumCandidateRuntime(directCallResult);
      if (directCallRuntime) {
        logChromiumFunctionExportResolution({
          constructorSucceeded,
          constructorResult,
          directCallSucceeded,
          directCallResult,
          resolvedResult: directCallResult,
        });
        return directCallRuntime;
      }
    } catch (error) {
      directCallResult = error;
    }

    logInvalidChromiumDefaultExportShape(chromiumModule, {
      constructorSucceeded,
      constructorResult,
      directCallSucceeded,
      directCallResult,
    });
    throw new Error(
      "@sparticuz/chromium function export did not resolve args and executablePath.",
    );
  }

  logInvalidChromiumDefaultExportShape(chromiumModule);
  throw new Error(
    "@sparticuz/chromium export did not expose args and executablePath.",
  );
}

function logChromiumBinaryAssetDiagnostics() {
  const cwdBinPath = join(
    process.cwd(),
    "node_modules",
    "@sparticuz",
    "chromium",
    "bin",
  );
  const vercelTaskBinPath =
    "/var/task/node_modules/@sparticuz/chromium/bin";

  console.info("Browser PDF Chromium binary asset diagnostics", {
    cwdChromiumBinExists: existsSync(cwdBinPath),
    vercelTaskChromiumBinExists: existsSync(vercelTaskBinPath),
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
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
    chromium = await resolveSparticuzChromiumExport(chromiumModule);
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
  logChromiumBinaryAssetDiagnostics();
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

type PdfImageDiagnostic = {
  index: number;
  src: string;
  currentSrc: string;
  complete: boolean;
  failed: boolean;
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  loading: string;
  decoding: string;
  signedUrl: boolean;
};

type PdfPageDiagnostics = {
  url: string;
  title: string;
  renderedImageCount: number;
  failedImageCount: number;
  htmlSizeBytes: number;
  htmlSizeCharacters: number;
  imageDimensions: PdfImageDiagnostic[];
  browserPerformanceMemory?: {
    jsHeapSizeLimit?: number;
    totalJSHeapSize?: number;
    usedJSHeapSize?: number;
  };
};

type PdfResponseDiagnostic = {
  url: string;
  status: number;
  resourceType: string;
  contentLength?: string;
  contentType?: string;
  signedUrl: boolean;
};

type PdfRequestFailureDiagnostic = {
  url: string;
  resourceType: string;
  errorText?: string;
  signedUrl: boolean;
};

type PdfRenderDiagnostics = {
  responses: PdfResponseDiagnostic[];
  requestFailures: PdfRequestFailureDiagnostic[];
  pageErrors: Array<{ name: string; message: string; stack?: string }>;
  consoleErrors: Array<{ type: string; text: string }>;
};

function isLikelySignedUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const signedUrlParams = [
      "X-Amz-Signature",
      "X-Amz-Credential",
      "Signature",
      "Expires",
      "token",
    ];
    return signedUrlParams.some((param) => parsedUrl.searchParams.has(param));
  } catch {
    return false;
  }
}

async function collectPageDiagnostics(
  page: BrowserPage,
): Promise<PdfPageDiagnostics> {
  return page.evaluate(() => {
    const html = document.documentElement.outerHTML;
    const images = Array.from(document.images).map((image, index) => {
      const rect = image.getBoundingClientRect();
      const url = image.currentSrc || image.src;
      let signedUrl = false;
      try {
        const parsedUrl = new URL(url, window.location.href);
        signedUrl = [
          "X-Amz-Signature",
          "X-Amz-Credential",
          "Signature",
          "Expires",
          "token",
        ].some((param) => parsedUrl.searchParams.has(param));
      } catch {
        signedUrl = false;
      }
      return {
        index,
        src: image.src,
        currentSrc: image.currentSrc,
        complete: image.complete,
        failed: image.naturalWidth === 0,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        renderedWidth: Math.round(rect.width),
        renderedHeight: Math.round(rect.height),
        loading: image.loading,
        decoding: image.decoding,
        signedUrl,
      };
    });
    const memory =
      "memory" in performance
        ? (performance as Performance & {
            memory?: {
              jsHeapSizeLimit?: number;
              totalJSHeapSize?: number;
              usedJSHeapSize?: number;
            };
          }).memory
        : undefined;
    return {
      url: window.location.href,
      title: document.title,
      renderedImageCount: images.filter((image) => image.naturalWidth > 0)
        .length,
      failedImageCount: images.filter((image) => image.failed).length,
      htmlSizeBytes: new TextEncoder().encode(html).byteLength,
      htmlSizeCharacters: html.length,
      imageDimensions: images,
      browserPerformanceMemory: memory
        ? {
            jsHeapSizeLimit: memory.jsHeapSizeLimit,
            totalJSHeapSize: memory.totalJSHeapSize,
            usedJSHeapSize: memory.usedJSHeapSize,
          }
        : undefined,
    };
  });
}

function logPrePdfDiagnostics(params: {
  pageDiagnostics: PdfPageDiagnostics;
  renderDiagnostics: PdfRenderDiagnostics;
  browserMetrics: Record<string, number>;
}) {
  const imageResponses = params.renderDiagnostics.responses.filter(
    (response) => response.resourceType === "image" || response.signedUrl,
  );
  const failedImageResponses = imageResponses.filter(
    (response) => response.status >= 400,
  );
  const signedUrlResponses = params.renderDiagnostics.responses.filter(
    (response) => response.signedUrl,
  );
  const failedSignedUrlResponses = signedUrlResponses.filter(
    (response) => response.status >= 400,
  );
  const failedImageRequests = params.renderDiagnostics.requestFailures.filter(
    (request) => request.resourceType === "image" || request.signedUrl,
  );

  console.info("Browser PDF pre-print diagnostics", {
    page: params.pageDiagnostics,
    signedUrlStatus: {
      total: signedUrlResponses.length,
      failed: failedSignedUrlResponses.length,
      statuses: signedUrlResponses.map((response) => ({
        url: response.url,
        status: response.status,
        resourceType: response.resourceType,
        contentLength: response.contentLength,
        contentType: response.contentType,
      })),
    },
    imageStatus: {
      totalResponses: imageResponses.length,
      failedResponses: failedImageResponses.length,
      failedRequests: failedImageRequests,
      statuses: imageResponses.map((response) => ({
        url: response.url,
        status: response.status,
        contentLength: response.contentLength,
        contentType: response.contentType,
        signedUrl: response.signedUrl,
      })),
    },
    routeRenderingErrors: {
      pageErrors: params.renderDiagnostics.pageErrors,
      consoleErrors: params.renderDiagnostics.consoleErrors,
      requestFailures: params.renderDiagnostics.requestFailures,
    },
    browserMetrics: params.browserMetrics,
    likelyFailureSignals: {
      imagePayloadSize: imageResponses.map((response) => ({
        url: response.url,
        contentLength: response.contentLength,
        status: response.status,
      })),
      invalidSignedUrls:
        failedSignedUrlResponses.length > 0 ||
        failedImageRequests.some((request) => request.signedUrl),
      pageMemoryUsage: {
        jsHeap: params.pageDiagnostics.browserPerformanceMemory,
        metrics: params.browserMetrics,
      },
      printableRouteRenderingErrors:
        params.renderDiagnostics.pageErrors.length > 0 ||
        params.renderDiagnostics.consoleErrors.length > 0,
    },
    nodeEnvironment: process.env.NODE_ENV,
    vercelEnvironment: process.env.VERCEL_ENV,
  });
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
    const renderDiagnostics: PdfRenderDiagnostics = {
      responses: [],
      requestFailures: [],
      pageErrors: [],
      consoleErrors: [],
    };
    page.on("response", (response) => {
      const headers = response.headers();
      const url = response.url();
      renderDiagnostics.responses.push({
        url,
        status: response.status(),
        resourceType: response.request().resourceType(),
        contentLength: headers["content-length"],
        contentType: headers["content-type"],
        signedUrl: isLikelySignedUrl(url),
      });
    });
    page.on("requestfailed", (request) => {
      const url = request.url();
      renderDiagnostics.requestFailures.push({
        url,
        resourceType: request.resourceType(),
        errorText: request.failure()?.errorText,
        signedUrl: isLikelySignedUrl(url),
      });
    });
    page.on("pageerror", (error) => {
      renderDiagnostics.pageErrors.push({
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    });
    page.on("console", (message) => {
      const messageType = message.type();
      if (["error", "warn", "warning"].includes(messageType)) {
        renderDiagnostics.consoleErrors.push({
          type: messageType,
          text: message.text(),
        });
      }
    });
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
    const pageDiagnostics = await collectPageDiagnostics(page);
    const browserMetrics = await page.metrics();
    logPrePdfDiagnostics({
      pageDiagnostics,
      renderDiagnostics,
      browserMetrics,
    });
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
