declare module "puppeteer-core" {
  export type CookieParam = { name: string; value: string; domain: string; path: string };
  export type PDFOptions = Record<string, unknown>;
  export interface Page {
    setDefaultNavigationTimeout(timeout: number): void;
    setDefaultTimeout(timeout: number): void;
    setCookie(...cookies: CookieParam[]): Promise<void>;
    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;
    emulateMediaType(type: "screen" | "print" | null): Promise<void>;
    goto(url: string, options: { waitUntil: "networkidle0"; timeout: number }): Promise<unknown>;
    evaluate<T>(fn: (arg: T) => Promise<void>, arg: T): Promise<void>;
    pdf(options: PDFOptions): Promise<Uint8Array>;
  }
  export interface Browser { newPage(): Promise<Page>; close(): Promise<void>; }
  export function launch(options: Record<string, unknown>): Promise<Browser>;
}

declare module "@sparticuz/chromium" {
  export const args: string[];
  export function executablePath(): Promise<string>;
}
