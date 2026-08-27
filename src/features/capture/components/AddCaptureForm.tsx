"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useRouter } from "next/navigation";

import {
  createCaptureRecordFromUploadedFile,
  createTextNoteCaptureRecord,
  updateCaptureItemNote,
  validateCaptureBillingAccess,
} from "@/features/capture/actions";
import {
  type CaptureIntent,
  type CaptureType,
  type SourceDocumentType,
} from "@/features/capture/types";
import {
  getPendingCaptures,
  getQueuedCapture,
  removeCapture as removeOfflineCapture,
  saveQueuedCapture,
} from "@/features/offline/queue";
import { getOfflineSyncEngine } from "@/features/offline/sync-engine";
import type {
  OfflineCaptureRecord,
  QueueStatus,
} from "@/features/offline/types";
import { createClient } from "@/lib/supabase/client";

import styles from "./CaptureComposer.module.css";

const MAX_BATCH_FILES = 50;
const MEDIA_NOTE_AUTOSAVE_DELAY_MS = 800;

type ComposerSourceKind = "observation" | "document" | "note";
type ComposerAttachmentKind =
  | "primary"
  | "supporting"
  | "document"
  | "note";

function createClientItemId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8.5 6.5 10 4h4l1.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2h3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.25" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="8.2" cy="9" r="1.5" fill="currentColor" />
      <path d="m5.5 17 4.2-4.2 3 2.8 2.2-2.1 3.6 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6V3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14 3v5h4M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function storageObjectAlreadyExists(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("already exists") ||
    normalized.includes("duplicate") ||
    normalized.includes("resource already exists")
  );
}

type UploadStatus =
  | "queued"
  | "uploading"
  | "finishing"
  | "metadata_recovery"
  | "saved"
  | "needs_queue_retry"
  | "failed";
type DiagnosticEvidenceRole =
  | "meter_reading_photo"
  | "scan_tool_screenshot"
  | "connector_photo"
  | "wiring_reference"
  | "voice_note"
  | "technician_note"
  | "other";

const DIAGNOSTIC_EVIDENCE_ROLE_OPTIONS: Array<{
  value: DiagnosticEvidenceRole;
  label: string;
}> = [
  { value: "meter_reading_photo", label: "Meter reading photo" },
  { value: "scan_tool_screenshot", label: "Scan tool screenshot" },
  { value: "connector_photo", label: "Connector photo" },
  { value: "wiring_reference", label: "Wiring reference" },
  { value: "voice_note", label: "Voice note" },
  { value: "technician_note", label: "Technician note" },
  { value: "other", label: "Other" },
];

type SelectedEvidenceFile = {
  id: string;
  file: File;
  name: string;
  type: string;
  size: number;
  previewUrl: string;
  status: UploadStatus;
  error?: string;
  note: string;
  captureItemId?: string;
  storagePath?: string;
  storageUploaded?: boolean;
  noteSaveStatus?: "idle" | "unsaved" | "saving" | "saved" | "failed";
  clientItemId: string;
  documentationItemId?: string;
  attachmentOrder: number;
  sourceKind: ComposerSourceKind;
  attachmentKind: ComposerAttachmentKind;
  sourceDocumentType?: SourceDocumentType;
  sourceDocumentLabel?: string;
};

type OfflineCaptureSyncedDetail = {
  localId: string;
  sessionId: string;
  captureItemId: string;
  documentationItemId?: string;
  clientItemId?: string;
};

type SpeechRecognitionResultLike = {
  0?: { transcript?: string };
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult:
    | ((event: { results: ArrayLike<SpeechRecognitionResultLike> }) => void)
    | null;
  onend: (() => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type VoiceNoteStatus =
  | "idle"
  | "listening"
  | "stopped"
  | "cancelled"
  | "unsupported"
  | "denied"
  | "error";

const FILE_INPUT_CONFIG: Record<
  CaptureType | "auto_evidence",
  { accept: string; capture?: "environment" }
> = {
  auto_evidence: { accept: "image/*", capture: "environment" },
  photo: { accept: "image/*", capture: "environment" },
  vin_plate: { accept: "image/*", capture: "environment" },
  info_plate: { accept: "image/*", capture: "environment" },
  document: { accept: "application/pdf,image/*" },
  voice_note: { accept: "audio/*" },
  text_note: { accept: "" },
  video: { accept: "" },
  evidence_video: { accept: "" },
};

const ALLOWED_MIME_TYPES: Record<CaptureType, readonly string[]> = {
  photo: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ],
  vin_plate: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ],
  info_plate: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ],
  document: [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",
  ],
  voice_note: [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/webm",
    "audio/ogg",
    "audio/aac",
    "audio/x-m4a",
  ],
  text_note: [],
  video: [
    // Follow-up: re-enable after the live documentation-captures bucket and
    // report path are verified for video. Do not offer media Storage may reject.
  ],
  evidence_video: [
    // Follow-up: see video note above.
  ],
};

const LOCAL_UPLOAD_PENDING_STATUSES: UploadStatus[] = [
  "queued",
  "uploading",
  "finishing",
  "metadata_recovery",
  "failed",
];

type PersistedSelectedEvidenceFile = Omit<
  SelectedEvidenceFile,
  "previewUrl"
> & {
  sessionId: string;
  organizationId: string;
  storagePath?: string;
  queuedAt?: string;
};

function isLocalUploadPending(status: UploadStatus) {
  return LOCAL_UPLOAD_PENDING_STATUSES.includes(status);
}

function mapUploadStatusToQueueStatus(status: UploadStatus): QueueStatus {
  if (status === "saved") return "synced";
  if (status === "failed") return "failed";

  if (status === "metadata_recovery" || status === "needs_queue_retry") {
    return "blocked";
  }

  if (status === "finishing") {
    return "creating_record";
  }

  if (status === "uploading") {
    return "uploading";
  }

  return "queued";
}

function sanitizeFilename(filename: string) {
  const sanitized = filename
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96);

  return sanitized || "capture-file";
}

function buildStorageFilename(file: File) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const uniqueId =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${timestamp}-${uniqueId}-${sanitizeFilename(file.name)}`;
}

function fileIsImage(file: File) {
  return ALLOWED_MIME_TYPES.photo.includes(file.type.toLowerCase());
}

function fileIsVideo(file: File) {
  return ALLOWED_MIME_TYPES.video.includes(file.type.toLowerCase());
}

function fileHasAllowedType(file: File, captureType: CaptureType) {
  return ALLOWED_MIME_TYPES[captureType].includes(file.type.toLowerCase());
}

function formatFileSize(bytes: number) {
  const megabytes = bytes / (1024 * 1024);
  return `${Number.isInteger(megabytes) ? megabytes.toFixed(0) : megabytes.toFixed(1)}MB`;
}

function getUploadStatusLabel(status: UploadStatus, error?: string) {
  if (status === "queued") return "Saved on device";
  if (status === "uploading") return "Uploading";
  if (status === "finishing") return "Finishing save";
  if (status === "metadata_recovery") return "Save incomplete — retry";
  if (status === "needs_queue_retry") return "Needs attention";
  if (status === "saved") return "Synced";
  if (status === "failed") return error ?? "Upload failed. Please retry.";
  return "Saved on device";
}

function isAuthFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("jwt") ||
    normalized.includes("auth") ||
    normalized.includes("unauthorized") ||
    normalized.includes("not authenticated") ||
    normalized.includes("sign-in expired") ||
    normalized.includes("sign in again") ||
    normalized.includes("session expired") ||
    normalized.includes("refresh token")
  );
}

function isConnectivityFailureMessage(message: string) {
  const normalized = message.toLowerCase();

  return (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("offline") ||
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("connection")
  );
}

function getFriendlyUploadError(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("larger than your plan") ||
    normalized.includes("maximum file size")
  ) {
    return "File too large for your plan";
  }

  if (
    normalized.includes("storage") &&
    (normalized.includes("limit") || normalized.includes("allowance"))
  ) {
    return "Storage limit reached";
  }

  if (isAuthFailureMessage(message)) {
    return "Sign in again to continue uploading.";
  }

  if (isConnectivityFailureMessage(message)) {
    return "Upload failed — retry when your connection is better.";
  }

  if (
    normalized.includes("file type") ||
    normalized.includes("not currently supported")
  ) {
    return "This file type is not currently supported.";
  }

  if (normalized.includes("finish saving") || normalized.includes("metadata")) {
    return "The image uploaded, but CRED could not finish saving it. Tap Retry.";
  }

  return (
    message || "Upload failed. Your file is still backed up on this device."
  );
}

function getBatchUploadFailureMessage(
  failedMessages: string[],
  savedCount: number,
) {
  const hasAuthFailure = failedMessages.some(isAuthFailureMessage);
  const hasConnectivityFailure = failedMessages.some(
    isConnectivityFailureMessage,
  );
  const prefix = savedCount > 0 ? "Some files were saved. " : "";

  if (hasAuthFailure) {
    return `${prefix}Sign in again to continue uploading.`;
  }

  if (hasConnectivityFailure) {
    return `${prefix}Upload failed — retry when your connection is better.`;
  }

  return `${prefix}Upload failed while saving to CRED. Your file is backed up on this device and CRED will keep retrying.`;
}

async function refreshAuthSession(supabase: ReturnType<typeof createClient>) {
  const { data: sessionData, error: sessionError } =
    await supabase.auth.getSession();

  if (sessionError) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    return !refreshError;
  }

  if (sessionData.session) return true;

  const { error: refreshError } = await supabase.auth.refreshSession();
  return !refreshError;
}

export function AddCaptureForm({
  sessionId,
  organizationId,
  userId,
  guidedStep,
  guidedLabel,
  workflow,
  returnPath,
  stickyDoneHref,
  maxCaptureFileSizeBytes,
  maxVideoFileSizeBytes,
  maxFileSizeLabel,
  observationGroupId = null,
}: {
  sessionId: string;
  organizationId: string;
  userId: string;
  sessionType?: string | null;
  guidedStep?: string;
  guidedLabel?: string;
  workflow?: string;
  returnPath?: string;
  captureButtonLabel?: string;
  helperText?: string;
  commonCaptureText?: string;
  showSuggestedCaptureText?: boolean;
  stickyDoneHref?: string;
  maxCaptureFileSizeBytes: number;
  maxVideoFileSizeBytes: number;
  maxFileSizeLabel?: string;
  imageAiAssistEnabled?: boolean;
  observationGroupId?: string | null;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const voiceNoteTimeoutRef = useRef<number | null>(null);
  const selectedFilesRef = useRef<SelectedEvidenceFile[]>([]);
  const clientItemIdRef = useRef<string | null>(null);
  const documentationItemIdsRef = useRef(new Map<string, string>());
  const legacyGroupIdsRef = useRef(new Map<string, string>());
  const activeObservationGroupIdRef = useRef<string | null>(
    observationGroupId,
  );
  const isSavingRef = useRef(false);
  const uploadStartedFileIdsRef = useRef(new Set<string>());
  const noteAutosaveTimeoutsRef = useRef(new Map<string, number>());
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [backgroundSyncCount, setBackgroundSyncCount] = useState(0);
  const [clientError, setClientError] = useState<string | null>(null);
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>("auto_evidence");
  const [composerSourceKind, setComposerSourceKind] =
    useState<ComposerSourceKind>("observation");
  const [diagnosticEvidenceRole, setDiagnosticEvidenceRole] =
    useState<DiagnosticEvidenceRole>("other");
  const manualType: CaptureType = "document";
  const [preferCameraCapture, setPreferCameraCapture] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<SelectedEvidenceFile[]>(
    [],
  );
  const [itemDescription, setItemDescription] = useState("");
  const [note, setNote] = useState("");
  const [showTextNoteEditor, setShowTextNoteEditor] = useState(false);
  const [noteSource, setNoteSource] = useState<"manual" | "voice" | "edited">(
    "manual",
  );
  const [transcriptStatus, setTranscriptStatus] = useState<
    "not_started" | "pending" | "completed" | "unavailable"
  >("not_started");
  const [voiceNoteStatus, setVoiceNoteStatus] =
    useState<VoiceNoteStatus>("idle");
  const isDiagnosticProcedureAttachment = workflow === "diagnostic_procedure";
  const activeType =
    captureIntent === "auto_evidence" || captureIntent === "auto_image"
      ? "auto_evidence"
      : manualType;
  const fileConfig = useMemo(() => {
    const config = FILE_INPUT_CONFIG[activeType];
    return preferCameraCapture ? config : { accept: config.accept };
  }, [activeType, preferCameraCapture]);
  const guidanceKey = guidedStep
    ? `${workflow ?? "guided"}-${guidedStep}`
    : "general";
  const fileInputId = `capture-file-${guidanceKey}`;
  const supportsMultipleFiles =
    !preferCameraCapture &&
    (captureIntent === "auto_evidence" || captureIntent === "auto_image");
  const captureSizeLabel =
    maxFileSizeLabel ?? formatFileSize(maxCaptureFileSizeBytes);
  const videoSizeLabel = formatFileSize(maxVideoFileSizeBytes);
  const failedFiles = selectedFiles.filter(
    (file) => file.status === "failed" || file.status === "metadata_recovery",
  );
  const selectedFileCount = selectedFiles.length;
  const selectedFileCountLabel = `${selectedFileCount} ${composerSourceKind === "document" ? "file" : "photo"}${selectedFileCount === 1 ? "" : "s"}`;
  const uploadableFiles =
    failedFiles.length > 0
      ? failedFiles
      : selectedFiles.filter((file) => file.status === "queued");

  function getActiveClientItemId() {
    clientItemIdRef.current ??= createClientItemId();
    return clientItemIdRef.current;
  }

  async function writeUploadQueueRecord(record: PersistedSelectedEvidenceFile) {
    const existing = await getQueuedCapture(record.id);
    const timestamp = new Date().toISOString();

    const queuedRecord: OfflineCaptureRecord = {
      localId: record.id,
      clientMutationId: existing?.clientMutationId ?? record.id,
      localSessionId: existing?.localSessionId ?? record.sessionId,
      serverSessionId:
        existing?.serverSessionId ??
        (record.sessionId.startsWith("offline-") ? null : record.sessionId),
      organizationId: record.organizationId,
      workspaceId: existing?.workspaceId ?? null,
      sessionId: record.sessionId,
      userId:
        existing?.userId && existing.userId !== "current-user"
          ? existing.userId
          : userId,
      blob: record.file,
      metadata: {
        captureIntent:
          record.sourceKind === "document" ? "manual" : "auto_evidence",
        manualType: record.sourceKind === "document" ? "document" : null,
        guidedStep: guidedStep ?? null,
        guidedLabel: guidedLabel ?? null,
        workflow: workflow ?? null,
        technicianNote: record.note,
        transcriptStatus,
        noteSource,
        reportOrder: null,
        includeInReport: true,
        filename: record.file.name,
        mimeType: record.file.type,
        size: record.file.size,
        uploadStatus: record.status,
        uiError: record.error,
        captureItemId: record.captureItemId,
        storageUploaded: record.storageUploaded,
        noteSaveStatus: record.noteSaveStatus,
        clientItemId: record.clientItemId,
        documentationItemId: record.documentationItemId ?? null,
        attachmentOrder: record.attachmentOrder,
        sourceKind: record.sourceKind,
        attachmentKind: record.attachmentKind,
        sourceDocumentType: record.sourceDocumentType ?? null,
        sourceDocumentLabel: record.sourceDocumentLabel ?? null,
      },
      status: mapUploadStatusToQueueStatus(record.status),
      retryCount: existing?.retryCount ?? 0,
      lastError: record.error ?? null,
      uploadState: {
        storagePath: record.storagePath ?? null,
        uploadedAt: record.storageUploaded
          ? (existing?.uploadState.uploadedAt ?? timestamp)
          : null,
        finalizedAt: record.status === "saved" ? timestamp : null,
        verifiedAt: record.status === "saved" ? timestamp : null,
      },
      serverCaptureId: record.captureItemId ?? null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    await saveQueuedCapture(queuedRecord);
  }

  async function deleteUploadQueueRecord(fileId: string) {
    await removeOfflineCapture(fileId);
  }

  async function readUploadQueueRecords(
    targetSessionId: string,
  ): Promise<PersistedSelectedEvidenceFile[]> {
    const records = await getPendingCaptures();
    const scopedRecords = records.filter(
      (record) =>
        record.sessionId === targetSessionId &&
        record.organizationId === organizationId &&
        (record.userId === userId || record.userId === "current-user"),
    );

    await Promise.all(
      scopedRecords
        .filter((record) => record.userId === "current-user")
        .map((record) =>
          saveQueuedCapture({
            ...record,
            userId,
          }),
        ),
    );

    return scopedRecords.map((record) => {
      const metadata = record.metadata;
      const file =
        record.blob instanceof File
          ? record.blob
          : new File([record.blob], metadata.filename, {
              type: metadata.mimeType,
            });

      return {
        id: record.localId,
        file,
        name: metadata.filename,
        type: metadata.mimeType,
        size: metadata.size,
        status:
          metadata.uploadStatus === "uploading"
            ? "queued"
            : ((metadata.uploadStatus ?? "queued") as UploadStatus),
        error: metadata.uiError,
        note: metadata.technicianNote,
        captureItemId:
          metadata.captureItemId ?? record.serverCaptureId ?? undefined,
        storagePath: record.uploadState.storagePath ?? undefined,
        storageUploaded:
          metadata.storageUploaded ?? Boolean(record.uploadState.uploadedAt),
        noteSaveStatus: metadata.noteSaveStatus as
          | SelectedEvidenceFile["noteSaveStatus"]
          | undefined,
        clientItemId: metadata.clientItemId || `legacy-${record.sessionId}`,
        documentationItemId: metadata.documentationItemId ?? undefined,
        attachmentOrder:
          typeof metadata.attachmentOrder === "number" &&
          metadata.attachmentOrder > 0
            ? metadata.attachmentOrder
            : (metadata.reportOrder ?? 1),
        sourceKind:
          metadata.sourceKind === "document" || metadata.sourceKind === "note"
            ? metadata.sourceKind
            : "observation",
        attachmentKind:
          metadata.attachmentKind === "document" ||
          metadata.attachmentKind === "note" ||
          metadata.attachmentKind === "supporting"
            ? metadata.attachmentKind
            : "primary",
        sourceDocumentType:
          metadata.sourceDocumentType as SourceDocumentType | undefined,
        sourceDocumentLabel: metadata.sourceDocumentLabel ?? undefined,
        sessionId: record.sessionId,
        organizationId: record.organizationId,
        queuedAt: record.createdAt,
      };
    });
  }

  function getMaxFileSizeForFile(file: File) {
    return fileIsVideo(file) ? maxVideoFileSizeBytes : maxCaptureFileSizeBytes;
  }

  function getFileTooLargeMessage(file: File) {
    return `This file is larger than your plan allows. ${fileIsVideo(file) ? "Video" : "Image"} files can be up to ${formatFileSize(getMaxFileSizeForFile(file))}.`;
  }

  useEffect(() => {
    const noteAutosaveTimeouts = noteAutosaveTimeoutsRef.current;

    return () => {
      noteAutosaveTimeouts.forEach((timeoutId) =>
        window.clearTimeout(timeoutId),
      );
      noteAutosaveTimeouts.clear();
      selectedFilesRef.current.forEach((file) =>
        URL.revokeObjectURL(file.previewUrl),
      );
    };
  }, []);

  useEffect(() => {
    activeObservationGroupIdRef.current = observationGroupId;
    if (observationGroupId) {
      clientItemIdRef.current = observationGroupId;
      legacyGroupIdsRef.current.set(observationGroupId, observationGroupId);
    }
  }, [observationGroupId]);

  useEffect(() => {
    function handleOfflineCaptureSynced(event: Event) {
      const detail = (event as CustomEvent<OfflineCaptureSyncedDetail>).detail;

      if (!detail || detail.sessionId !== sessionId) {
        return;
      }

      let matchedCapture = false;

      setSelectedFiles((currentFiles) => {
        const nextFiles = currentFiles.map((file) => {
          if (file.id !== detail.localId) {
            return file;
          }

          matchedCapture = true;

          return {
            ...file,
            status: "saved" as UploadStatus,
            error: undefined,
            captureItemId: detail.captureItemId,
            documentationItemId:
              detail.documentationItemId ?? file.documentationItemId,
            storageUploaded: true,
            noteSaveStatus:
              file.noteSaveStatus === "failed"
                ? "unsaved"
                : file.noteSaveStatus,
          };
        });

        selectedFilesRef.current = nextFiles;
        return nextFiles;
      });

      uploadStartedFileIdsRef.current.add(detail.localId);

      if (detail.documentationItemId && detail.clientItemId) {
        documentationItemIdsRef.current.set(
          detail.clientItemId,
          detail.documentationItemId,
        );
      }

      if (matchedCapture) {
        setActionError(null);
        setSaveMessage("Item synced. Ready for review.");
      }

      router.refresh();
    }

    window.addEventListener(
      "cred:offline-capture-synced",
      handleOfflineCaptureSynced,
    );

    return () => {
      window.removeEventListener(
        "cred:offline-capture-synced",
        handleOfflineCaptureSynced,
      );
    };
  }, [router, sessionId]);

  function persistSelectedFile(file: SelectedEvidenceFile) {
    if (!isLocalUploadPending(file.status)) {
      void deleteUploadQueueRecord(file.id).catch((error: unknown) => {
        console.warn("Unable to clear persisted capture upload", error);
      });
      return;
    }

    void writeUploadQueueRecord({
      ...file,
      sessionId,
      organizationId,
    }).catch((error: unknown) => {
      console.warn("Unable to persist pending capture upload", error);
    });
  }

  function replaceSelectedFiles(files: SelectedEvidenceFile[]) {
    selectedFilesRef.current.forEach((file) =>
      URL.revokeObjectURL(file.previewUrl),
    );
    selectedFilesRef.current.forEach((file) => {
      void deleteUploadQueueRecord(file.id);
    });
    uploadStartedFileIdsRef.current = new Set(
      files
        .filter(
          (file) => file.status === "uploading" || file.status === "saved",
        )
        .map((file) => file.id),
    );
    selectedFilesRef.current = files;
    setSelectedFiles(files);
  }

  function resetFileSelection() {
    replaceSelectedFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearFilePicker() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function clearVisibleFileSelectionPreservingQueue() {
    selectedFilesRef.current.forEach((file) => {
      URL.revokeObjectURL(file.previewUrl);
    });

    selectedFilesRef.current = [];
    uploadStartedFileIdsRef.current = new Set();
    setSelectedFiles([]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function getSelectedEvidenceFileId(file: File, index: number) {
    return `${file.name}-${file.size}-${file.lastModified}-${index}`;
  }

  function buildSelectedEvidenceFiles(files: File[]): SelectedEvidenceFile[] {
    const clientItemId = getActiveClientItemId();
    const sourceKind: ComposerSourceKind =
      captureIntent === "manual" ? "document" : "observation";
    const existingAttachmentCount = selectedFilesRef.current.filter(
      (file) => file.clientItemId === clientItemId,
    ).length;

    return files.map((file, index) => {
      const attachmentOrder = existingAttachmentCount + index + 1;
      const isDocument = sourceKind === "document";

      return {
        id: `${getSelectedEvidenceFileId(file, index)}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        status: "queued" as UploadStatus,
        note: isDocument || attachmentOrder > 1 ? "" : itemDescription,
        noteSaveStatus: "idle" as const,
        clientItemId,
        documentationItemId:
          documentationItemIdsRef.current.get(clientItemId),
        attachmentOrder,
        sourceKind,
        attachmentKind: isDocument
          ? ("document" as const)
          : attachmentOrder === 1
            ? ("primary" as const)
            : ("supporting" as const),
        sourceDocumentType: isDocument ? ("other" as const) : undefined,
        sourceDocumentLabel: isDocument ? "Form or document" : undefined,
      };
    });
  }

  function updateSelectedFileStatus(
    fileId: string,
    status: UploadStatus,
    error?: string,
    captureItemId?: string,
    storageUploaded?: boolean,
  ) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              status,
              error,
              ...(captureItemId ? { captureItemId } : {}),
              ...(typeof storageUploaded === "boolean"
                ? { storageUploaded }
                : {}),
            }
          : file,
      );
      selectedFilesRef.current = nextFiles;
      const updatedFile = nextFiles.find((file) => file.id === fileId);
      if (updatedFile) persistSelectedFile(updatedFile);
      return nextFiles;
    });
  }

  function updateSelectedFileNoteStatus(
    fileId: string,
    noteSaveStatus: SelectedEvidenceFile["noteSaveStatus"],
  ) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId ? { ...file, noteSaveStatus } : file,
      );
      selectedFilesRef.current = nextFiles;
      const updatedFile = nextFiles.find((file) => file.id === fileId);
      if (updatedFile) persistSelectedFile(updatedFile);
      return nextFiles;
    });
  }

  async function validateFileSelection() {
    const files = Array.from(fileInputRef.current?.files ?? []);

    if (files.length === 0) {
      setClientError(null);
      return;
    }

    if (files.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`);
      clearFilePicker();
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > getMaxFileSizeForFile(file),
    );

    if (oversizedFile) {
      setClientError(getFileTooLargeMessage(oversizedFile));
      clearFilePicker();
      return;
    }

    if (
      (captureIntent === "auto_image" || captureIntent === "auto_evidence") &&
      files.some((file) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError("Choose a supported photo file.");
      clearFilePicker();
      return;
    }

    if (
      captureIntent === "manual" &&
      files.some((file) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError("Choose a PDF or image file for this form.");
      clearFilePicker();
      return;
    }

    const evidenceFiles = buildSelectedEvidenceFiles(files);
    setComposerSourceKind(
      evidenceFiles[0]?.sourceKind === "document" ? "document" : "observation",
    );

    setSaveMessage(
      `Saving ${evidenceFiles.length} ${evidenceFiles[0]?.sourceKind === "document" ? "file" : "photo"}${evidenceFiles.length === 1 ? "" : "s"} on this device…`,
    );

    try {
      await Promise.all(
        evidenceFiles.map((file) =>
          writeUploadQueueRecord({
            ...file,
            sessionId,
            organizationId,
          }),
        ),
      );
    } catch (error) {
      console.warn("Unable to save capture locally", error);
      setClientError(
        "CRED could not save this item on your device. Do not leave this page yet.",
      );
      return;
    }

    const nextFiles = [...selectedFilesRef.current, ...evidenceFiles];
    selectedFilesRef.current = nextFiles;
    setSelectedFiles(nextFiles);
    setClientError(null);
    setSaveMessage(
      `Saved on this device. ${navigator.onLine ? "Syncing now." : "CRED will sync when you reconnect."}`,
    );

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    if (captureIntent === "auto_image" || captureIntent === "auto_evidence") {
      void autoSaveSelectedMedia(evidenceFiles);
    }
  }

  function updateSelectedFileNote(fileId: string, noteValue: string) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              note: noteValue,
              noteSaveStatus: (file.captureItemId
                ? "unsaved"
                : "idle") as SelectedEvidenceFile["noteSaveStatus"],
            }
          : file,
      );
      selectedFilesRef.current = nextFiles;
      const updatedFile = nextFiles.find((file) => file.id === fileId);
      if (updatedFile) persistSelectedFile(updatedFile);
      return nextFiles;
    });

    scheduleSelectedFileNoteSave(fileId);
  }

  function updateItemDescriptionValue(description: string) {
    setItemDescription(description);
    setNoteSource("edited");

    const primaryFile = [...selectedFilesRef.current]
      .filter((file) => file.sourceKind === "observation")
      .sort((left, right) => left.attachmentOrder - right.attachmentOrder)[0];

    if (primaryFile) {
      updateSelectedFileNote(primaryFile.id, description);
    }
  }

  function moveSelectedFile(fileId: string, direction: -1 | 1) {
    const currentFiles = selectedFilesRef.current;
    const currentIndex = currentFiles.findIndex((file) => file.id === fileId);
    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= currentFiles.length ||
      currentFiles[currentIndex]?.status === "uploading" ||
      currentFiles[currentIndex]?.status === "finishing" ||
      currentFiles[targetIndex]?.status === "uploading" ||
      currentFiles[targetIndex]?.status === "finishing"
    ) {
      return;
    }

    const reordered = [...currentFiles];
    [reordered[currentIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[currentIndex],
    ];

    const normalized = reordered.map((file, index) => ({
      ...file,
      attachmentOrder: index + 1,
      attachmentKind:
        file.sourceKind === "document"
          ? ("document" as const)
          : index === 0
            ? ("primary" as const)
            : ("supporting" as const),
      note:
        file.sourceKind === "observation"
          ? index === 0
            ? itemDescription
            : ""
          : file.note,
      noteSaveStatus:
        file.captureItemId && file.sourceKind === "observation"
          ? ("unsaved" as const)
          : file.noteSaveStatus,
    }));

    selectedFilesRef.current = normalized;
    setSelectedFiles(normalized);
    normalized.forEach(persistSelectedFile);
    normalized
      .filter(
        (file) =>
          file.captureItemId && file.sourceKind === "observation",
      )
      .forEach((file) => scheduleSelectedFileNoteSave(file.id));
  }

  function scheduleSelectedFileNoteSave(fileId: string) {
    const existingTimeout = noteAutosaveTimeoutsRef.current.get(fileId);
    if (existingTimeout) {
      window.clearTimeout(existingTimeout);
    }

    const file = selectedFilesRef.current.find(
      (current) => current.id === fileId,
    );
    if (!file?.captureItemId) return;

    const timeoutId = window.setTimeout(() => {
      noteAutosaveTimeoutsRef.current.delete(fileId);
      void saveSelectedFileNote(fileId);
    }, MEDIA_NOTE_AUTOSAVE_DELAY_MS);
    noteAutosaveTimeoutsRef.current.set(fileId, timeoutId);
  }

  async function saveSelectedFileNote(fileId: string) {
    const file = selectedFilesRef.current.find(
      (current) => current.id === fileId,
    );
    if (!file?.captureItemId) return true;

    updateSelectedFileNoteStatus(fileId, "saving");

    const result = await updateCaptureItemNote({
      sessionId,
      captureItemId: file.captureItemId,
      technicianNote: file.note,
    });

    updateSelectedFileNoteStatus(fileId, result.ok ? "saved" : "failed");
    return result.ok;
  }

  async function flushMediaNoteSaves() {
    noteAutosaveTimeoutsRef.current.forEach((timeoutId) =>
      window.clearTimeout(timeoutId),
    );
    noteAutosaveTimeoutsRef.current.clear();

    const filesNeedingSave = selectedFilesRef.current.filter(
      (file) =>
        file.captureItemId &&
        (file.noteSaveStatus === "unsaved" || file.noteSaveStatus === "failed"),
    );

    if (filesNeedingSave.length === 0) return true;

    const results = await Promise.all(
      filesNeedingSave.map((file) => saveSelectedFileNote(file.id)),
    );
    return results.every(Boolean);
  }

  function hasUnsavedMediaNotes() {
    return selectedFilesRef.current.some(
      (file) =>
        file.captureItemId &&
        (file.noteSaveStatus === "unsaved" ||
          file.noteSaveStatus === "saving" ||
          file.noteSaveStatus === "failed"),
    );
  }

  function removeSelectedFile(fileId: string) {
    const fileToRemove = selectedFilesRef.current.find(
      (file) => file.id === fileId,
    );

    if (
      fileToRemove?.status === "uploading" ||
      fileToRemove?.status === "saved"
    ) {
      return;
    }

    if (
      !window.confirm(
        "Remove this file? It will no longer be available to retry from this device.",
      )
    ) {
      return;
    }

    const remainingFiles = selectedFilesRef.current.filter(
      (file) => file.id !== fileId,
    );
    URL.revokeObjectURL(fileToRemove?.previewUrl ?? "");
    void deleteUploadQueueRecord(fileId);
    selectedFilesRef.current = remainingFiles;
    setSelectedFiles(remainingFiles);

    if (fileInputRef.current && typeof DataTransfer !== "undefined") {
      const dataTransfer = new DataTransfer();
      remainingFiles.forEach((file) => dataTransfer.items.add(file.file));
      fileInputRef.current.files = dataTransfer.files;
    }

    setClientError(null);
    setActionError(null);
    setSaveMessage(null);
  }

  async function openCameraPicker() {
    await flushMediaNoteSaves();
    if (selectedFilesRef.current.length === 0) {
      clientItemIdRef.current ??= createClientItemId();
    }
    setCaptureIntent("auto_evidence");
    setComposerSourceKind("observation");
    setPreferCameraCapture(true);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function startNewItem(openCamera = false) {
    const currentFiles = [...selectedFilesRef.current];
    const pendingLocalUploads = currentFiles.filter((file) =>
      isLocalUploadPending(file.status),
    );

    if (pendingLocalUploads.length > 0) {
      try {
        await Promise.all(
          pendingLocalUploads.map((file) =>
            writeUploadQueueRecord({
              ...file,
              sessionId,
              organizationId,
            }),
          ),
        );
      } catch (queueError) {
        console.warn(
          "Unable to preserve capture before starting another item",
          queueError,
        );
        setClientError(
          "CRED could not save the current item on this device. Try again before continuing.",
        );
        return;
      }

      clearVisibleFileSelectionPreservingQueue();
      setSaveMessage(
        "Item saved on this device. CRED will finish syncing when it can.",
      );
    } else {
      const notesSaved = await flushMediaNoteSaves();

      if (!notesSaved) {
        setClientError(
          "Could not save the item description. Retry before starting a new item.",
        );
        return;
      }

      resetFileSelection();
      setSaveMessage("Item saved. Ready for the next one.");
    }

    clientItemIdRef.current = null;
    activeObservationGroupIdRef.current = null;
    setItemDescription("");
    setNote("");
    setNoteSource("manual");
    setTranscriptStatus("not_started");
    setVoiceNoteStatus("idle");
    setClientError(null);
    setActionError(null);
    setCaptureIntent("auto_evidence");
    setComposerSourceKind("observation");
    setPreferCameraCapture(true);

    if (openCamera) {
      clientItemIdRef.current = createClientItemId();
      window.setTimeout(() => fileInputRef.current?.click(), 0);
    }
  }

  async function openGalleryPicker() {
    await flushMediaNoteSaves();
    if (selectedFilesRef.current.length === 0) {
      clientItemIdRef.current ??= createClientItemId();
    }
    setCaptureIntent("auto_evidence");
    setComposerSourceKind("observation");
    setPreferCameraCapture(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function openDocumentPicker() {
    await flushMediaNoteSaves();
    if (selectedFilesRef.current.length === 0) {
      clientItemIdRef.current = createClientItemId();
    }
    setCaptureIntent("manual");
    setComposerSourceKind("document");
    setPreferCameraCapture(false);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  function triggerBackgroundProcessing() {
    fetch(`/api/dashboard/sessions/${sessionId}/captures/process`, {
      method: "POST",
      keepalive: true,
    }).catch((error: unknown) => {
      console.warn("Background capture processing trigger failed", error);
    });
  }

  async function autoSaveSelectedMedia(filesToSave: SelectedEvidenceFile[]) {
    const pendingFiles = filesToSave.filter((file) => {
      if (uploadStartedFileIdsRef.current.has(file.id)) {
        return false;
      }

      uploadStartedFileIdsRef.current.add(file.id);
      return true;
    });

    if (pendingFiles.length === 0) {
      return;
    }

    setBackgroundSyncCount((count) => count + 1);
    setActionError(null);
    setSaveMessage(
      `Syncing ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"}…`,
    );

    try {
      const result = await uploadSelectedFiles(pendingFiles);

      if (result.savedCount > 0) {
        cleanupRecognition();
        const savedDocument = pendingFiles.every(
          (file) => file.sourceKind === "document",
        );
        setSaveMessage(
          observationGroupId
            ? `${result.savedCount} photo${result.savedCount === 1 ? "" : "s"} added to this item.`
            : isDiagnosticProcedureAttachment
              ? `${result.savedCount} attachment${result.savedCount === 1 ? "" : "s"} saved for this procedure step.`
              : savedDocument
                ? "Form saved."
                : "Item synced.",
        );
        triggerBackgroundProcessing();
        router.refresh();
      }

      if (result.failedCount > 0) {
        pendingFiles
          .filter(
            (file) =>
              selectedFilesRef.current.find((current) => current.id === file.id)
                ?.status === "failed",
          )
          .forEach((file) => uploadStartedFileIdsRef.current.delete(file.id));
        setActionError(
          getBatchUploadFailureMessage(
            result.failedMessages,
            result.savedCount,
          ),
        );
      }
    } finally {
      setBackgroundSyncCount((count) => Math.max(0, count - 1));
    }
  }

  const resumeQueuedMediaUpload = useEffectEvent(
    async (files: SelectedEvidenceFile[]) => {
      await autoSaveSelectedMedia(files);
    },
  );

  useEffect(() => {
    let cancelled = false;

    // The queue reader intentionally uses the latest component state while
    // restoration is scoped by sessionId.
    readUploadQueueRecords(sessionId)
      .then((records) => {
        if (cancelled || records.length === 0) return;

        const recordsByItem = new Map<string, PersistedSelectedEvidenceFile[]>();
        records.forEach((record) => {
          recordsByItem.set(record.clientItemId, [
            ...(recordsByItem.get(record.clientItemId) ?? []),
            record,
          ]);
        });
        const orderedItemGroups = Array.from(recordsByItem.values()).sort(
          (left, right) =>
            (right.at(-1)?.queuedAt ?? "").localeCompare(
              left.at(-1)?.queuedAt ?? "",
            ),
        );
        const activeRecords = orderedItemGroups[0] ?? [];
        const restoredFiles = activeRecords.map((record) => ({
          ...record,
          status: record.status === "uploading" ? "queued" : record.status,
          previewUrl: URL.createObjectURL(record.file),
        }));

        const restoredPrimary = [...restoredFiles].sort(
          (left, right) => left.attachmentOrder - right.attachmentOrder,
        )[0];
        if (restoredPrimary) {
          clientItemIdRef.current = restoredPrimary.clientItemId;
          if (restoredPrimary.documentationItemId) {
            documentationItemIdsRef.current.set(
              restoredPrimary.clientItemId,
              restoredPrimary.documentationItemId,
            );
          }
          setComposerSourceKind(restoredPrimary.sourceKind);
          setCaptureIntent(
            restoredPrimary.sourceKind === "document"
              ? "manual"
              : "auto_evidence",
          );
          setItemDescription(
            restoredFiles.find(
              (file) => file.attachmentKind === "primary",
            )?.note ?? "",
          );
        }
        const nextFiles = [...selectedFilesRef.current, ...restoredFiles];
        selectedFilesRef.current = nextFiles;
        setSelectedFiles(nextFiles);

        const resumableFiles = restoredFiles.filter(
          (file) => file.status === "queued",
        );
        if (resumableFiles.length > 0) {
          setSaveMessage(
            `Resuming ${resumableFiles.length} pending file${resumableFiles.length === 1 ? "" : "s"}…`,
          );
          void resumeQueuedMediaUpload(resumableFiles).then(() =>
            getOfflineSyncEngine().syncNow(),
          );
        } else {
          void getOfflineSyncEngine().syncNow();
        }
      })
      .catch((error: unknown) => {
        console.warn("Unable to restore pending capture uploads", error);
      });

    return () => {
      cancelled = true;
    };
    // readUploadQueueRecords is component-scoped so it can serialize the
    // current capture metadata without duplicating queue logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  async function uploadSelectedFiles(filesToUpload: SelectedEvidenceFile[]) {
    const supabase = createClient();
    let savedCount = 0;
    let failedCount = 0;
    let currentObservationGroupId =
      legacyGroupIdsRef.current.get(filesToUpload[0]?.clientItemId ?? "") ??
      activeObservationGroupIdRef.current;
    const failedMessages: string[] = [];

    if (!navigator.onLine) {
      const message = "Upload failed — retry when your connection is better.";
      filesToUpload.forEach((selectedFile) =>
        updateSelectedFileStatus(selectedFile.id, "failed", message),
      );
      return {
        savedCount,
        failedCount: filesToUpload.length,
        failedMessages: [message],
      };
    }

    if (!(await refreshAuthSession(supabase))) {
      const message = "Sign in again to continue uploading.";
      filesToUpload.forEach((selectedFile) =>
        updateSelectedFileStatus(selectedFile.id, "failed", message),
      );
      setActionError(message);
      return {
        savedCount,
        failedCount: filesToUpload.length,
        failedMessages: [message],
      };
    }

    const accessResult = await validateCaptureBillingAccess(
      sessionId,
      filesToUpload.map((selectedFile) => ({
        size: selectedFile.file.size,
        mimeType: selectedFile.file.type,
      })),
    );

    if (!accessResult.ok) {
      const friendlyError = getFriendlyUploadError(accessResult.error);
      filesToUpload.forEach((selectedFile) =>
        updateSelectedFileStatus(selectedFile.id, "failed", friendlyError),
      );
      setActionError(friendlyError);
      return {
        savedCount,
        failedCount: filesToUpload.length,
        failedMessages: [friendlyError],
      };
    }

    for (const selectedFile of filesToUpload) {
      const { file } = selectedFile;
      const storagePath =
        selectedFile.storagePath ??
        `organizations/${organizationId}/sessions/${sessionId}/captures/${buildStorageFilename(file)}`;
      if (!selectedFile.storagePath) {
        selectedFile.storagePath = storagePath;
        setSelectedFiles((currentFiles) => {
          const nextFiles = currentFiles.map((currentFile) =>
            currentFile.id === selectedFile.id
              ? { ...currentFile, storagePath }
              : currentFile,
          );
          selectedFilesRef.current = nextFiles;
          return nextFiles;
        });
        persistSelectedFile({ ...selectedFile, storagePath });
      }

      let storageUploaded = Boolean(selectedFile.storageUploaded);

      updateSelectedFileStatus(
        selectedFile.id,
        storageUploaded ? "finishing" : "uploading",
        undefined,
        undefined,
        storageUploaded,
      );

      try {
        if (!storageUploaded) {
          if (!(await refreshAuthSession(supabase))) {
            throw new Error("Sign in again to continue uploading.");
          }

          const { error: uploadError } = await supabase.storage
            .from("documentation-captures")
            .upload(storagePath, file, {
              cacheControl: "3600",
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            if (storageObjectAlreadyExists(uploadError.message)) {
              const { error: overwriteError } = await supabase.storage
                .from("documentation-captures")
                .upload(storagePath, file, {
                  cacheControl: "3600",
                  contentType: file.type,
                  upsert: true,
                });

              if (overwriteError) {
                if (
                  isAuthFailureMessage(overwriteError.message) &&
                  (await refreshAuthSession(supabase))
                ) {
                  const { error: retryOverwriteError } = await supabase.storage
                    .from("documentation-captures")
                    .upload(storagePath, file, {
                      cacheControl: "3600",
                      contentType: file.type,
                      upsert: true,
                    });
                  if (!retryOverwriteError) {
                    storageUploaded = true;
                  } else {
                    throw new Error(retryOverwriteError.message);
                  }
                } else {
                  throw new Error(overwriteError.message);
                }
              }
            } else {
              if (
                isAuthFailureMessage(uploadError.message) &&
                (await refreshAuthSession(supabase))
              ) {
                const { error: retryUploadError } = await supabase.storage
                  .from("documentation-captures")
                  .upload(storagePath, file, {
                    cacheControl: "3600",
                    contentType: file.type,
                    upsert: false,
                  });
                if (retryUploadError) {
                  throw new Error(retryUploadError.message);
                }
              } else {
                throw new Error(uploadError.message);
              }
            }
          }

          storageUploaded = true;

          updateSelectedFileStatus(
            selectedFile.id,
            "finishing",
            undefined,
            undefined,
            true,
          );
        }

        if (!(await refreshAuthSession(supabase))) {
          throw new Error("Sign in again to continue uploading.");
        }

        let result = await createCaptureRecordFromUploadedFile({
          sessionId,
          storagePath,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          captureIntent:
            selectedFile.sourceKind === "document"
              ? "manual"
              : "auto_evidence",
          manualType:
            selectedFile.sourceKind === "document" ? "document" : null,
          guidedStep,
          guidedLabel,
          workflow,
          technicianNote: selectedFile.note,
          transcriptStatus,
          noteSource,
          reportOrder: null,
          includeInReport: true,
          sourceDocumentType: selectedFile.sourceDocumentType ?? null,
          sourceDocumentLabel: selectedFile.sourceDocumentLabel ?? null,
          diagnosticEvidenceRole: isDiagnosticProcedureAttachment
            ? diagnosticEvidenceRole
            : null,
          observationGroupId:
            legacyGroupIdsRef.current.get(selectedFile.clientItemId) ??
            currentObservationGroupId,
          clientItemId: selectedFile.clientItemId,
          documentationItemId:
            documentationItemIdsRef.current.get(selectedFile.clientItemId) ??
            selectedFile.documentationItemId ??
            null,
          attachmentOrder: selectedFile.attachmentOrder,
          sourceKind: selectedFile.sourceKind,
          attachmentKind: selectedFile.attachmentKind,
        });

        if (
          !result.ok &&
          result.stage === "authentication" &&
          (await refreshAuthSession(supabase))
        ) {
          result = await createCaptureRecordFromUploadedFile({
            sessionId,
            storagePath,
            filename: file.name,
            mimeType: file.type,
            size: file.size,
            captureIntent:
              selectedFile.sourceKind === "document"
                ? "manual"
                : "auto_evidence",
            manualType:
              selectedFile.sourceKind === "document" ? "document" : null,
            guidedStep,
            guidedLabel,
            workflow,
            technicianNote: selectedFile.note,
            transcriptStatus,
            noteSource,
            reportOrder: null,
            includeInReport: true,
            sourceDocumentType: selectedFile.sourceDocumentType ?? null,
            sourceDocumentLabel: selectedFile.sourceDocumentLabel ?? null,
            diagnosticEvidenceRole: isDiagnosticProcedureAttachment
              ? diagnosticEvidenceRole
              : null,
            observationGroupId:
              legacyGroupIdsRef.current.get(selectedFile.clientItemId) ??
              currentObservationGroupId,
            clientItemId: selectedFile.clientItemId,
            documentationItemId:
              documentationItemIdsRef.current.get(selectedFile.clientItemId) ??
              selectedFile.documentationItemId ??
              null,
            attachmentOrder: selectedFile.attachmentOrder,
            sourceKind: selectedFile.sourceKind,
            attachmentKind: selectedFile.attachmentKind,
          });
        }

        if (!result.ok) {
          const message =
            result.stage === "authentication"
              ? "Sign in again to continue uploading."
              : (result.message ?? result.error);
          if (result.storageUploaded || result.storagePath) {
            storageUploaded = true;
            updateSelectedFileStatus(
              selectedFile.id,
              result.stage === "metadata" ||
                result.code === "metadata_creation_failed"
                ? "metadata_recovery"
                : "failed",
              getFriendlyUploadError(message),
              undefined,
              true,
            );
          }
          throw new Error(message);
        }

        savedCount += 1;
        if (result.documentationItemId) {
          documentationItemIdsRef.current.set(
            selectedFile.clientItemId,
            result.documentationItemId,
          );
          setSelectedFiles((currentFiles) => {
            const nextFiles = currentFiles.map((currentFile) =>
              currentFile.clientItemId === selectedFile.clientItemId
                ? {
                    ...currentFile,
                    documentationItemId: result.documentationItemId,
                    ...(currentFile.id === selectedFile.id
                      ? {
                          attachmentOrder: result.attachmentOrder,
                          attachmentKind: result.attachmentKind,
                          sourceKind: result.sourceKind,
                        }
                      : {}),
                  }
                : currentFile,
            );
            selectedFilesRef.current = nextFiles;
            nextFiles
              .filter(
                (currentFile) =>
                  currentFile.clientItemId === selectedFile.clientItemId,
              )
              .forEach(persistSelectedFile);
            return nextFiles;
          });
        }
        if (!currentObservationGroupId) {
          currentObservationGroupId = result.captureItemId;
          legacyGroupIdsRef.current.set(
            selectedFile.clientItemId,
            result.captureItemId,
          );
          activeObservationGroupIdRef.current = result.captureItemId;
        }
        updateSelectedFileStatus(
          selectedFile.id,
          "saved",
          undefined,
          result.captureItemId,
          true,
        );
        const latestFile = selectedFilesRef.current.find(
          (current) => current.id === selectedFile.id,
        );
        if (latestFile?.note && latestFile.note !== selectedFile.note) {
          updateSelectedFileNoteStatus(selectedFile.id, "unsaved");
          scheduleSelectedFileNoteSave(selectedFile.id);
        } else {
          updateSelectedFileNoteStatus(selectedFile.id, "saved");
        }
      } catch (error) {
        failedCount += 1;
        const message = getFriendlyUploadError(
          error instanceof Error
            ? error.message
            : "Upload failed. Check your connection and retry.",
        );
        failedMessages.push(message);
        updateSelectedFileStatus(
          selectedFile.id,
          storageUploaded ? "metadata_recovery" : "failed",
          message,
          undefined,
          storageUploaded,
        );
      }
    }

    return { savedCount, failedCount, failedMessages };
  }

  async function saveTextNoteOnly() {
    const result = await createTextNoteCaptureRecord({
      sessionId,
      guidedStep,
      guidedLabel,
      workflow,
      technicianNote: note,
      noteSource,
      reportOrder: null,
      includeInReport: true,
      diagnosticEvidenceRole: isDiagnosticProcedureAttachment
        ? diagnosticEvidenceRole
        : null,
    });

    if (!result.ok) {
      setActionError(result.error);
      return false;
    }

    cleanupRecognition();
    setSaveMessage("Saved. Keep capturing or tap Done.");
    router.refresh();
    return true;
  }

  async function handleStandaloneTextNoteSave() {
    if (isSavingRef.current || isSaving) {
      return;
    }

    if (backgroundSyncCount > 0) {
      setClientError("This item is still syncing. You can continue in a moment.");
      return;
    }

    if (!note.trim()) {
      setClientError("Type a note before saving.");
      return;
    }

    setClientError(null);
    setActionError(null);
    setSaveMessage(null);
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const saved = await saveTextNoteOnly();

      if (!saved) {
        return;
      }

      setNote("");
      setNoteSource("manual");
      setTranscriptStatus("not_started");
      setVoiceNoteStatus("idle");
      setShowTextNoteEditor(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  function cancelStandaloneTextNote() {
    cleanupRecognition();
    setNote("");
    setNoteSource("manual");
    setTranscriptStatus("not_started");
    setVoiceNoteStatus("idle");
    setShowTextNoteEditor(false);
    setClientError(null);
    setActionError(null);
  }

  function startStandaloneVoiceNote() {
    setClientError(null);
    setActionError(null);
    setSaveMessage(null);

    const speechWindow = window as typeof window & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const Recognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!Recognition) {
      setVoiceNoteStatus("unsupported");
      setTranscriptStatus("unavailable");
      setShowTextNoteEditor(true);
      setClientError(
        "Voice notes are not supported in this browser. Type a note instead.",
      );
      return;
    }

    cleanupRecognition();

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognitionRef.current = recognition;

    recognition.onresult = (event) => {
      let transcript = "";
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index]?.[0]?.transcript ?? "";
      }
      setNote(transcript.trim());
      setNoteSource("voice");
    };
    recognition.onerror = (event) => {
      recognitionRef.current = null;
      setTranscriptStatus("unavailable");
      setVoiceNoteStatus(event.error === "not-allowed" ? "denied" : "error");
      setClientError(
        event.error === "not-allowed"
          ? "Microphone access was denied. Type a note instead."
          : "Voice note stopped unexpectedly. Review or type your note, then save.",
      );
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setTranscriptStatus((current) =>
          current === "pending" ? "completed" : current,
        );
        setVoiceNoteStatus("stopped");
      }
    };

    try {
      recognition.start();
      setShowTextNoteEditor(true);
      setTranscriptStatus("pending");
      setVoiceNoteStatus("listening");
      setNoteSource("voice");
      voiceNoteTimeoutRef.current = window.setTimeout(() => {
        stopVoiceNote(
          "Voice note stopped after the time limit. Review your note, then save it.",
        );
      }, 120_000);
    } catch {
      recognitionRef.current = null;
      setTranscriptStatus("unavailable");
      setVoiceNoteStatus("error");
      setClientError("Could not start a voice note. Type a note instead.");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSavingRef.current || isSaving) {
      return;
    }

    const filesToUpload = uploadableFiles;

    if (selectedFiles.length === 0) {
      setClientError("Take a photo, choose photos, or add a form first.");
      return;
    }

    if (
      selectedFiles.some(
        (file) => file.status === "uploading" || file.status === "finishing",
      )
    ) {
      setClientError("This item is still syncing. You can continue in a moment.");
      return;
    }

    if (selectedFiles.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`);
      return;
    }

    if (
      selectedFiles.some((file) => file.sourceKind === "document") &&
      selectedFiles.length > 1
    ) {
      setClientError("Add one form or document at a time.");
      return;
    }

    if (filesToUpload.some(({ file }) => file.size <= 0)) {
      setClientError("One selected file is empty. Choose another file.");
      return;
    }

    const oversizedFile = filesToUpload.find(
      ({ file }) => file.size > getMaxFileSizeForFile(file),
    );

    if (oversizedFile) {
      const message = "File too large for your plan";
      updateSelectedFileStatus(oversizedFile.id, "failed", message);
      setClientError(message);
      return;
    }

    if (
      filesToUpload.some(
        ({ file, sourceKind }) =>
          sourceKind === "observation" &&
          !fileIsImage(file) &&
          !fileIsVideo(file),
      )
    ) {
      setClientError("This file type is not currently supported.");
      return;
    }

    if (
      filesToUpload.some(
        ({ file, sourceKind }) =>
          sourceKind === "document" && !fileHasAllowedType(file, "document"),
      )
    ) {
      setClientError("Choose a PDF or image file for this form.");
      return;
    }

    setClientError(null);
    setActionError(null);
    setSaveMessage(null);
    isSavingRef.current = true;
    setIsSaving(true);

    try {
      const result =
        filesToUpload.length > 0
          ? await uploadSelectedFiles(filesToUpload)
          : { savedCount: 0, failedCount: 0, failedMessages: [] };

      if (result.savedCount > 0 && filesToUpload.length > 0) {
        cleanupRecognition();
        triggerBackgroundProcessing();
        router.refresh();
      }

      if (result.failedCount > 0) {
        setActionError(
          getBatchUploadFailureMessage(
            result.failedMessages,
            result.savedCount,
          ),
        );
        return;
      }

      const notesSaved = await flushMediaNoteSaves();
      if (!notesSaved) {
        setClientError("Could not save the item description. Try again.");
        return;
      }

      if (returnPath && isDiagnosticProcedureAttachment) {
        window.location.assign(
          `${returnPath}${returnPath.includes("?") ? "&" : "?"}captureSaved=1`,
        );
        return;
      }

      if (returnPath && observationGroupId) {
        window.location.assign(returnPath);
        return;
      }

      await startNewItem(false);
    } finally {
      isSavingRef.current = false;
      setIsSaving(false);
    }
  }

  const clearVoiceNoteTimeout = useCallback(() => {
    if (voiceNoteTimeoutRef.current) {
      window.clearTimeout(voiceNoteTimeoutRef.current);
      voiceNoteTimeoutRef.current = null;
    }
  }, []);

  const cleanupRecognition = useCallback(() => {
    clearVoiceNoteTimeout();

    const recognition = recognitionRef.current;
    if (!recognition) {
      return;
    }

    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;

    try {
      if (recognition.abort) {
        recognition.abort();
      } else {
        recognition.stop();
      }
    } catch (error) {
      console.warn("Voice note cleanup failed", error);
    } finally {
      recognitionRef.current = null;
    }
  }, [clearVoiceNoteTimeout]);

  const stopVoiceNote = useCallback(
    (message = "Voice note stopped.") => {
      clearVoiceNoteTimeout();

      const recognition = recognitionRef.current;
      if (recognition) {
        recognitionRef.current = null;
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;

        try {
          recognition.stop();
        } catch (error) {
          console.warn("Voice note stop failed", error);
        }
      }

      setTranscriptStatus((current) =>
        current === "pending" ? "completed" : current,
      );
      setVoiceNoteStatus("stopped");
      setSaveMessage(message);
    },
    [clearVoiceNoteTimeout],
  );

  useEffect(() => {
    function stopOnPageExit() {
      cleanupRecognition();
    }

    function warnAboutUnsavedMediaNotes(event: BeforeUnloadEvent) {
      const hasPendingLocalUploads = selectedFilesRef.current.some((file) =>
        isLocalUploadPending(file.status),
      );
      if (!hasUnsavedMediaNotes() && !hasPendingLocalUploads) return;

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("pagehide", stopOnPageExit);
    window.addEventListener("beforeunload", stopOnPageExit);
    window.addEventListener("beforeunload", warnAboutUnsavedMediaNotes);

    return () => {
      window.removeEventListener("pagehide", stopOnPageExit);
      window.removeEventListener("beforeunload", stopOnPageExit);
      window.removeEventListener("beforeunload", warnAboutUnsavedMediaNotes);
      cleanupRecognition();
    };
  }, [cleanupRecognition]);

  async function handleDoneNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (isSaving || backgroundSyncCount > 0) {
      event.preventDefault();
      setClientError("This item is still syncing. Review will open when it is saved.");
      return;
    }

    const pendingLocalUploads = selectedFilesRef.current.filter((file) =>
      isLocalUploadPending(file.status),
    );

    if (pendingLocalUploads.length > 0) {
      event.preventDefault();
      setClientError(
        `Still syncing ${pendingLocalUploads.length} file${pendingLocalUploads.length === 1 ? "" : "s"}. Review will open when they are saved.`,
      );
      void autoSaveSelectedMedia(
        pendingLocalUploads.filter((file) => file.status !== "uploading"),
      );
      return;
    }

    if (!hasUnsavedMediaNotes()) return;

    event.preventDefault();
    const saved = await flushMediaNoteSaves();
    if (saved && stickyDoneHref) {
      router.push(stickyDoneHref);
      return;
    }

    setClientError("Could not save the item description. Try again before leaving.");
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <input type="hidden" name="session_id" value={sessionId} />
      <input type="hidden" name="capture_intent" value={captureIntent} />
      <input type="hidden" name="manual_type" value={manualType} />
      <input type="hidden" name="transcript_status" value={transcriptStatus} />
      <input type="hidden" name="note_source" value={noteSource} />
      {guidedStep ? (
        <input type="hidden" name="guided_step" value={guidedStep} />
      ) : null}
      {guidedLabel ? (
        <input type="hidden" name="guided_label" value={guidedLabel} />
      ) : null}
      {workflow ? (
        <input type="hidden" name="session_workflow" value={workflow} />
      ) : null}
      {returnPath ? (
        <input type="hidden" name="return_path" value={returnPath} />
      ) : null}
      {isDiagnosticProcedureAttachment ? (
        <label className="field-stack">
          <span className="label">Attachment type</span>
          <select
            className="input"
            value={diagnosticEvidenceRole}
            onChange={(event) =>
              setDiagnosticEvidenceRole(
                event.target.value as DiagnosticEvidenceRole,
              )
            }
            disabled={isSaving}
          >
            {DIAGNOSTIC_EVIDENCE_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {clientError || actionError ? (
        <p className={styles.errorMessage} role="alert">
          {clientError ?? actionError}
        </p>
      ) : null}
      {saveMessage ? (
        <p className={styles.statusMessage} role="status" aria-live="polite">
          {saveMessage}
        </p>
      ) : null}

      {selectedFiles.length === 0 ? (
        <section className={styles.startPanel} aria-labelledby={`${fileInputId}-title`}>
          <div className={styles.startCopy}>
            <p className={styles.eyebrow}>
              {observationGroupId ? "Add photos" : "Capture"}
            </p>
            <h2 id={`${fileInputId}-title`}>
              {observationGroupId ? "Add photos to this item" : "Add an item"}
            </h2>
            <p>
              {observationGroupId
                ? "New photos will stay together with the item you selected."
                : "Keep photos of the same subject together as one item."}
            </p>
          </div>
          <div className={styles.actionGrid} aria-label="Capture options">
            <button
              type="button"
              className={`${styles.actionButton} ${styles.primaryAction}`}
              onClick={openCameraPicker}
              disabled={isSaving}
            >
              <span className={styles.actionIcon}>
                <CameraIcon />
              </span>
              <span className={styles.actionLabel}>
                <strong>Take photo</strong>
                <small>Use the camera</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={openGalleryPicker}
              disabled={isSaving}
            >
              <span className={styles.actionIcon}>
                <GalleryIcon />
              </span>
              <span className={styles.actionLabel}>
                <strong>Choose photos</strong>
                <small>Select one or several</small>
              </span>
            </button>
            {!observationGroupId ? (
              <button
                type="button"
                className={styles.actionButton}
                onClick={openDocumentPicker}
                disabled={isSaving}
              >
                <span className={styles.actionIcon}>
                  <DocumentIcon />
                </span>
                <span className={styles.actionLabel}>
                  <strong>Scan or upload form</strong>
                  <small>PDF or photographed document</small>
                </span>
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <input
        ref={fileInputRef}
        key={`${captureIntent}-${activeType}-${preferCameraCapture ? "camera" : "gallery"}`}
        id={fileInputId}
        type="file"
        accept={fileConfig.accept}
        capture={fileConfig.capture}
        multiple={supportsMultipleFiles}
        className="visually-hidden"
        onChange={validateFileSelection}
        disabled={isSaving}
      />

      {selectedFiles.length > 0 ? (
        <section className={styles.composerPanel} aria-label="Current item">
          <header className={styles.composerHeader}>
            <div>
              <p className={styles.eyebrow}>
                {composerSourceKind === "document"
                  ? "Forms & documents"
                  : observationGroupId
                    ? "Existing item"
                    : "New item"}
              </p>
              <h2>
                {composerSourceKind === "document"
                  ? "Form or document"
                  : observationGroupId
                    ? "Add photos"
                    : "Item photos"}
              </h2>
              <p>
                {composerSourceKind === "document"
                  ? "This will stay separate from documented items."
                  : "Every photo in this strip belongs to the same item."}
              </p>
            </div>
            <span className={styles.countBadge}>{selectedFileCountLabel}</span>
          </header>

          <div className={styles.thumbnailStrip} aria-label="Selected files">
            {selectedFiles.map((file, index) => {
              const canChangeOrder =
                file.status === "queued" ||
                file.status === "failed" ||
                file.status === "metadata_recovery" ||
                file.status === "needs_queue_retry";
              const canRemove = canChangeOrder && file.status !== "uploading";

              return (
                <article key={file.id} className={styles.thumbnailTile}>
                  <div className={styles.thumbnailFrame}>
                    {file.type.startsWith("video/") ? (
                      <video src={file.previewUrl} controls preload="metadata" />
                    ) : file.type.startsWith("image/") ? (
                      <Image
                        src={file.previewUrl}
                        alt={
                          composerSourceKind === "document"
                            ? "Selected form or document"
                            : `Photo ${index + 1} for this item`
                        }
                        fill
                        sizes="116px"
                        unoptimized
                      />
                    ) : (
                      <div className={styles.documentPreview}>
                        <DocumentIcon />
                        <span>Document selected</span>
                      </div>
                    )}
                  </div>
                  <div className={styles.thumbnailMeta}>
                    <strong>
                      {composerSourceKind === "document"
                        ? "Document"
                        : `Photo ${index + 1}`}
                    </strong>
                    <span
                      className={`${styles.quietStatus} ${file.status === "failed" || file.status === "metadata_recovery" ? styles.attentionStatus : ""}`}
                      role="status"
                    >
                      {getUploadStatusLabel(file.status, file.error)}
                    </span>
                  </div>
                  {composerSourceKind !== "document" ? (
                    <div className={styles.thumbnailControls}>
                      <button
                        type="button"
                        className={styles.thumbnailControl}
                        onClick={() => moveSelectedFile(file.id, -1)}
                        disabled={!canChangeOrder || index === 0}
                        aria-label={`Move photo ${index + 1} left`}
                        title="Move left"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className={styles.thumbnailControl}
                        onClick={() => moveSelectedFile(file.id, 1)}
                        disabled={
                          !canChangeOrder || index === selectedFiles.length - 1
                        }
                        aria-label={`Move photo ${index + 1} right`}
                        title="Move right"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className={`${styles.thumbnailControl} ${styles.removeControl}`}
                        onClick={() => removeSelectedFile(file.id)}
                        disabled={!canRemove}
                        aria-label={`Remove photo ${index + 1}`}
                        title={
                          canRemove
                            ? "Remove photo"
                            : "Synced photos can be removed during review"
                        }
                      >
                        ×
                      </button>
                    </div>
                  ) : canRemove ? (
                    <button
                      type="button"
                      className={`${styles.textButton} ${styles.removeControl}`}
                      onClick={() => removeSelectedFile(file.id)}
                    >
                      Remove file
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>

          {composerSourceKind === "observation" && !observationGroupId ? (
            <div className={styles.descriptionField}>
              <label htmlFor={`${fileInputId}-item-description`}>
                What did you document?
              </label>
              <textarea
                id={`${fileInputId}-item-description`}
                value={itemDescription}
                placeholder="Example: Coolant level below minimum before service."
                onChange={(event) =>
                  updateItemDescriptionValue(event.target.value)
                }
                rows={3}
                maxLength={2000}
                disabled={isSaving}
              />
              <span className={styles.quietStatus}>
                One description applies to the complete item.
              </span>
            </div>
          ) : null}

          <div className={styles.composerActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={
                isSaving ||
                backgroundSyncCount > 0 ||
                selectedFiles.some(
                  (file) =>
                    file.status === "uploading" || file.status === "finishing",
                )
              }
            >
              {isSaving
                ? "Saving…"
                : failedFiles.length > 0
                  ? "Retry save"
                  : composerSourceKind === "document"
                    ? "Save form"
                    : observationGroupId
                      ? "Save photos"
                      : "Save item"}
            </button>
            {composerSourceKind === "observation" ? (
              <>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={openCameraPicker}
                  disabled={isSaving}
                >
                  Add another photo
                </button>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={openGalleryPicker}
                  disabled={isSaving}
                >
                  Choose photos
                </button>
              </>
            ) : null}
          </div>
        </section>
      ) : null}

      {selectedFiles.length === 0 ? (
        <div className={styles.noteActions} aria-label="Add a note instead">
          {showTextNoteEditor ? (
            <div className={styles.noteEditor}>
              <label className="field-stack" htmlFor={`${fileInputId}-text-note`}>
                <span className="label">Note</span>
                <textarea
                  id={`${fileInputId}-text-note`}
                  className="input note-textarea"
                  value={note}
                  placeholder="Type a note for this session."
                  onChange={(event) => setNote(event.target.value)}
                  rows={4}
                  disabled={isSaving}
                />
              </label>
              <div className={styles.composerActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleStandaloneTextNoteSave}
                  disabled={isSaving || !note.trim()}
                >
                  {isSaving ? "Saving…" : "Save note"}
                </button>
                {voiceNoteStatus === "listening" ? (
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() =>
                      stopVoiceNote(
                        "Voice note stopped. Review your note, then save it.",
                      )
                    }
                    disabled={isSaving}
                  >
                    Stop listening
                  </button>
                ) : null}
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={cancelStandaloneTextNote}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  setClientError(null);
                  setActionError(null);
                  setShowTextNoteEditor(true);
                }}
                disabled={isSaving}
              >
                Add a note instead
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={startStandaloneVoiceNote}
                disabled={isSaving}
              >
                Dictate note
              </button>
            </>
          )}
        </div>
      ) : null}

      <p className={styles.limits}>
        Files can be up to {captureSizeLabel}. Video remains limited to {videoSizeLabel}.
      </p>

      {stickyDoneHref ? (
        <div className={styles.stickyActions}>
          <Link
            href={stickyDoneHref}
            className={styles.primaryButton}
            onClick={handleDoneNavigation}
            aria-disabled={isSaving}
          >
            {isSaving ? "Saving…" : "Review items"}
          </Link>
        </div>
      ) : null}
    </form>
  );
}
