import SessionReportPreviewPage from "../report/page";

export default async function SessionApprovePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const status = await searchParams;

  return SessionReportPreviewPage({
    params,
    searchParams: Promise.resolve({ ...status, flow_step: "approve" }),
  });
}
