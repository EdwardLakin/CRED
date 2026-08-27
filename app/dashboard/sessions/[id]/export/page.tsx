import SessionReportPreviewPage from "../report/page";

export default async function SessionExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const status = await searchParams;

  return SessionReportPreviewPage({
    params,
    searchParams: Promise.resolve({ ...status, flow_step: "export" }),
  });
}
