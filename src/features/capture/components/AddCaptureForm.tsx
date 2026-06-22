"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
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
import { type CaptureIntent, type CaptureType } from "@/features/capture/types";
import { createClient } from "@/lib/supabase/client";

const MAX_BATCH_FILES = 50;
const MEDIA_NOTE_AUTOSAVE_DELAY_MS = 800;

type UploadStatus =
  | "queued"
  | "uploading"
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
  noteSaveStatus?: "idle" | "unsaved" | "saving" | "saved" | "failed";
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
  auto_evidence: { accept: "image/*,video/*", capture: "environment" },
  photo: { accept: "image/*", capture: "environment" },
  vin_plate: { accept: "image/*", capture: "environment" },
  info_plate: { accept: "image/*", capture: "environment" },
  document: { accept: "application/pdf,image/*" },
  voice_note: { accept: "audio/*" },
  text_note: { accept: "" },
  video: { accept: "video/*", capture: "environment" },
  evidence_video: { accept: "video/*", capture: "environment" },
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
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/mpeg",
  ],
  evidence_video: [
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-msvideo",
    "video/mpeg",
  ],
};

const UPLOAD_QUEUE_DB_NAME = "cred-capture-upload-queue";
const UPLOAD_QUEUE_STORE_NAME = "pending_files";
const UPLOAD_QUEUE_DB_VERSION = 1;
const LOCAL_UPLOAD_PENDING_STATUSES: UploadStatus[] = [
  "queued",
  "uploading",
  "failed",
];

type PersistedSelectedEvidenceFile = Omit<
  SelectedEvidenceFile,
  "previewUrl"
> & {
  sessionId: string;
  organizationId: string;
  storagePath?: string;
};

function isLocalUploadPending(status: UploadStatus) {
  return LOCAL_UPLOAD_PENDING_STATUSES.includes(status);
}

function openUploadQueueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(
      UPLOAD_QUEUE_DB_NAME,
      UPLOAD_QUEUE_DB_VERSION,
    );
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(UPLOAD_QUEUE_STORE_NAME)) {
        db.createObjectStore(UPLOAD_QUEUE_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function writeUploadQueueRecord(record: PersistedSelectedEvidenceFile) {
  const db = await openUploadQueueDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(UPLOAD_QUEUE_STORE_NAME, "readwrite");
    transaction.objectStore(UPLOAD_QUEUE_STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function deleteUploadQueueRecord(fileId: string) {
  const db = await openUploadQueueDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(UPLOAD_QUEUE_STORE_NAME, "readwrite");
    transaction.objectStore(UPLOAD_QUEUE_STORE_NAME).delete(fileId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function readUploadQueueRecords(sessionId: string) {
  const db = await openUploadQueueDb();
  const records = await new Promise<PersistedSelectedEvidenceFile[]>(
    (resolve, reject) => {
      const request = db
        .transaction(UPLOAD_QUEUE_STORE_NAME, "readonly")
        .objectStore(UPLOAD_QUEUE_STORE_NAME)
        .getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () =>
        resolve(
          (request.result as PersistedSelectedEvidenceFile[]).filter(
            (record) => record.sessionId === sessionId,
          ),
        );
    },
  );
  db.close();
  return records;
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
  if (status === "uploading") return "Uploading";
  if (status === "needs_queue_retry") return "Needs attention";
  if (status === "saved") return "Saved";
  if (status === "failed") return error ?? "Upload failed. Please retry.";
  return "Saved";
}

function getNoteSaveStatusLabel(
  status: SelectedEvidenceFile["noteSaveStatus"],
) {
  if (status === "unsaved") return "Unsaved";
  if (status === "saving") return "Saving…";
  if (status === "saved") return "Saved";
  if (status === "failed") return "Save failed";
  return "Unsaved until media upload completes";
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

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("offline")
  ) {
    return "Upload failed — bad connection";
  }

  return message || "Upload failed. Please retry.";
}

export function AddCaptureForm({
  sessionId,
  organizationId,
  guidedStep,
  guidedLabel,
  workflow,
  returnPath,
  stickyDoneHref,
  maxCaptureFileSizeBytes,
  maxVideoFileSizeBytes,
  maxFileSizeLabel,
  imageAiAssistEnabled = true,
  observationGroupId = null,
}: {
  sessionId: string;
  organizationId: string;
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
  const isSavingRef = useRef(false);
  const uploadStartedFileIdsRef = useRef(new Set<string>());
  const noteAutosaveTimeoutsRef = useRef(new Map<string, number>());
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [captureIntent, setCaptureIntent] =
    useState<CaptureIntent>("auto_evidence");
  const [diagnosticEvidenceRole, setDiagnosticEvidenceRole] =
    useState<DiagnosticEvidenceRole>("other");
  const manualType: CaptureType = "document";
  const [preferCameraCapture, setPreferCameraCapture] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<SelectedEvidenceFile[]>(
    [],
  );
  const [activeObservationGroupId, setActiveObservationGroupId] = useState<
    string | null
  >(observationGroupId);
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
    captureIntent === "auto_evidence" || captureIntent === "auto_image";
  const captureSizeLabel =
    maxFileSizeLabel ?? formatFileSize(maxCaptureFileSizeBytes);
  const videoSizeLabel = formatFileSize(maxVideoFileSizeBytes);
  const failedFiles = selectedFiles.filter((file) => file.status === "failed");
  const observationFiles = selectedFiles.filter(
    (file) => file.status !== "failed",
  );
  const savedObservationFiles = observationFiles.filter(
    (file) => file.status === "saved",
  );
  const imageCountLabel = `${savedObservationFiles.length || observationFiles.length} image${(savedObservationFiles.length || observationFiles.length) === 1 ? "" : "s"}`;
  const uploadableFiles =
    failedFiles.length > 0
      ? failedFiles
      : selectedFiles.filter((file) => file.status === "queued");

  function getMaxFileSizeForFile(file: File) {
    return fileIsVideo(file) ? maxVideoFileSizeBytes : maxCaptureFileSizeBytes;
  }

  function getFileTooLargeMessage(file: File) {
    return `This file is larger than your plan allows. ${fileIsVideo(file) ? "Video" : "Capture"} files can be up to ${formatFileSize(getMaxFileSizeForFile(file))}.`;
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

  function getSelectedEvidenceFileId(file: File, index: number) {
    return `${file.name}-${file.size}-${file.lastModified}-${index}`;
  }

  function buildSelectedEvidenceFiles(files: File[]): SelectedEvidenceFile[] {
    return files.map((file, index) => ({
      id: `${getSelectedEvidenceFileId(file, index)}-${typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`,
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      status: "queued",
      note: "",
      noteSaveStatus: "idle",
    }));
  }

  function updateSelectedFileStatus(
    fileId: string,
    status: UploadStatus,
    error?: string,
    captureItemId?: string,
  ) {
    setSelectedFiles((currentFiles) => {
      const nextFiles = currentFiles.map((file) =>
        file.id === fileId
          ? {
              ...file,
              status,
              error,
              ...(captureItemId ? { captureItemId } : {}),
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
      return nextFiles;
    });
  }

  async function validateFileSelection() {
    const files = Array.from(fileInputRef.current?.files ?? []);

    if (files.length === 0) {
      replaceSelectedFiles([]);
      setClientError(null);
      return;
    }

    if (files.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`);
      resetFileSelection();
      return;
    }

    const oversizedFile = files.find(
      (file) => file.size > getMaxFileSizeForFile(file),
    );

    if (oversizedFile) {
      setClientError(getFileTooLargeMessage(oversizedFile));
      resetFileSelection();
      return;
    }

    if (
      (captureIntent === "auto_image" || captureIntent === "auto_evidence") &&
      files.some((file) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError("Capture Evidence accepts photo or video files only.");
      resetFileSelection();
      return;
    }

    if (
      captureIntent === "manual" &&
      files.some((file) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError("That file type is not allowed for this capture.");
      resetFileSelection();
      return;
    }

    const evidenceFiles = buildSelectedEvidenceFiles(files);
    const nextFiles = [...selectedFilesRef.current, ...evidenceFiles];
    selectedFilesRef.current = nextFiles;
    setSelectedFiles(nextFiles);
    setClientError(null);

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
      return nextFiles;
    });

    scheduleSelectedFileNoteSave(fileId);
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
    setCaptureIntent("auto_evidence");
    setPreferCameraCapture(true);
    window.setTimeout(() => fileInputRef.current?.click(), 0);
  }

  async function openGalleryPicker() {
    await flushMediaNoteSaves();
    setCaptureIntent("auto_evidence");
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

    setActionError(null);
    setSaveMessage(
      `Uploading ${pendingFiles.length} file${pendingFiles.length === 1 ? "" : "s"} in background…`,
    );

    try {
      const result = await uploadSelectedFiles(pendingFiles);

      if (result.savedCount > 0) {
        cleanupRecognition();
        setSaveMessage(
          observationGroupId
            ? `${result.savedCount} supporting image${result.savedCount === 1 ? "" : "s"} added to this item.`
            : isDiagnosticProcedureAttachment
              ? `${result.savedCount} attachment${result.savedCount === 1 ? "" : "s"} saved for this procedure step.`
              : imageAiAssistEnabled
                ? `${result.savedCount} capture${result.savedCount === 1 ? "" : "s"} saved. Ready for review.`
                : `${result.savedCount} capture${result.savedCount === 1 ? "" : "s"} saved. Ready for review.`,
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
          result.savedCount > 0
            ? "Some files were saved. Failed files are still here — retry them when your connection is better."
            : "Upload failed — retry when your connection is better.",
        );
      }
    } finally {
      // Background uploads should not block camera/gallery controls.
    }
  }

  useEffect(() => {
    let cancelled = false;

    readUploadQueueRecords(sessionId)
      .then((records) => {
        if (cancelled || records.length === 0) return;

        const restoredFiles = records.map((record) => ({
          ...record,
          status: record.status === "uploading" ? "queued" : record.status,
          previewUrl: URL.createObjectURL(record.file),
        }));
        const nextFiles = [...selectedFilesRef.current, ...restoredFiles];
        selectedFilesRef.current = nextFiles;
        setSelectedFiles(nextFiles);

        const resumableFiles = restoredFiles.filter(
          (file) => file.status === "queued",
        );
        if (resumableFiles.length > 0) {
          setSaveMessage(
            `Resuming ${resumableFiles.length} pending upload${resumableFiles.length === 1 ? "" : "s"}…`,
          );
          void autoSaveSelectedMedia(resumableFiles);
        }
      })
      .catch((error: unknown) => {
        console.warn("Unable to restore pending capture uploads", error);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function uploadSelectedFiles(filesToUpload: SelectedEvidenceFile[]) {
    const supabase = createClient();
    let savedCount = 0;
    let failedCount = 0;
    let currentObservationGroupId = activeObservationGroupId;

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
      return { savedCount, failedCount: filesToUpload.length };
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

      updateSelectedFileStatus(selectedFile.id, "uploading");

      try {
        const { error: uploadError } = await supabase.storage
          .from("documentation-captures")
          .upload(storagePath, file, {
            cacheControl: "3600",
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          throw new Error(uploadError.message);
        }

        const result = await createCaptureRecordFromUploadedFile({
          sessionId,
          storagePath,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          captureIntent,
          manualType: captureIntent === "manual" ? manualType : null,
          guidedStep,
          guidedLabel,
          workflow,
          technicianNote: selectedFile.note,
          transcriptStatus,
          noteSource,
          reportOrder: null,
          includeInReport: true,
          sourceDocumentType: null,
          sourceDocumentLabel: null,
          diagnosticEvidenceRole: isDiagnosticProcedureAttachment
            ? diagnosticEvidenceRole
            : null,
          observationGroupId: currentObservationGroupId,
        });

        if (!result.ok) {
          await supabase.storage
            .from("documentation-captures")
            .remove([storagePath]);
          throw new Error(result.error);
        }

        savedCount += 1;
        if (!currentObservationGroupId) {
          currentObservationGroupId = result.captureItemId;
          setActiveObservationGroupId(result.captureItemId);
        }
        updateSelectedFileStatus(
          selectedFile.id,
          "saved",
          undefined,
          result.captureItemId,
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
        updateSelectedFileStatus(selectedFile.id, "failed", message);
      }
    }

    return { savedCount, failedCount };
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

    if (!note.trim()) {
      setClientError("Type a note before saving text evidence.");
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
          "Voice note stopped after the time limit. Review your note, then save evidence.",
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

    if (voiceNoteStatus === "listening") {
      stopVoiceNote("Voice note stopped.");
      setClientError(
        "Voice note stopped. Review your note, then save evidence.",
      );
      return;
    }

    const filesToUpload = uploadableFiles;
    const hasTextNote = note.trim().length > 0;

    if (filesToUpload.length === 0 && !hasTextNote) {
      setClientError("Choose a file or type a text note to save evidence.");
      return;
    }

    if (selectedFiles.length > MAX_BATCH_FILES) {
      setClientError(`Upload up to ${MAX_BATCH_FILES} files at a time.`);
      return;
    }

    if (captureIntent === "manual" && selectedFiles.length > 1) {
      setClientError("Advanced manual uploads support one file at a time.");
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
      (captureIntent === "auto_image" || captureIntent === "auto_evidence") &&
      filesToUpload.some(({ file }) => !fileIsImage(file) && !fileIsVideo(file))
    ) {
      setClientError("Capture Evidence accepts photo or video files only.");
      return;
    }

    if (
      captureIntent === "manual" &&
      filesToUpload.some(({ file }) => !fileHasAllowedType(file, manualType))
    ) {
      setClientError("That file type is not allowed for this capture.");
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
          : { savedCount: (await saveTextNoteOnly()) ? 1 : 0, failedCount: 0 };

      if (result.savedCount > 0 && filesToUpload.length > 0) {
        cleanupRecognition();
        setSaveMessage("Saved. Keep capturing or tap Done.");
        triggerBackgroundProcessing();
        router.refresh();
      }

      if (result.savedCount === 0 && filesToUpload.length === 0) {
        return;
      }

      if (result.failedCount > 0) {
        setActionError(
          result.savedCount > 0
            ? "Some files were saved. Failed files are still here — retry them when your connection is better."
            : "Upload failed — retry when your connection is better.",
        );
        return;
      }

      window.setTimeout(() => {
        resetFileSelection();
        setNote("");
        setNoteSource("manual");
        setTranscriptStatus("not_started");
        setVoiceNoteStatus("idle");
        setPreferCameraCapture(true);
      }, 900);

      if (returnPath) {
        window.setTimeout(() => {
          window.location.assign(
            `${returnPath}${returnPath.includes("?") ? "&" : "?"}captureSaved=1`,
          );
        }, 900);
      }
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
    const pendingLocalUploads = selectedFilesRef.current.filter((file) =>
      isLocalUploadPending(file.status),
    );

    if (pendingLocalUploads.length > 0) {
      event.preventDefault();
      setClientError(
        `Still uploading ${pendingLocalUploads.length} file${pendingLocalUploads.length === 1 ? "" : "s"}. Done will unlock after uploads are persisted.`,
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

    setClientError("Could not save one media note. Try again before leaving.");
  }

  return (
    <form onSubmit={handleSubmit} className="capture-form form-stack">
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
        <label className="field-stack capture-secondary-panel">
          <span className="label">Evidence role for this step attachment</span>
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
        <p className="error">{clientError ?? actionError}</p>
      ) : null}
      {saveMessage ? <p className="success">{saveMessage}</p> : null}

      <div className="capture-start-panel observation-workspace-hero field-stack">
        <div>
          <p className="eyebrow">Observation Workspace</p>
          <h2>Document one observation</h2>
          <p className="muted">
            Add images and notes here until this observation is complete.
          </p>
        </div>
        <div
          className="capture-primary-action-grid"
          aria-label="Primary capture actions"
        >
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={openCameraPicker}
            disabled={isSaving}
          >
            <span className="capture-evidence-icon" aria-hidden="true">
              📷
            </span>
            <span>
              <strong>Add Image</strong>
              <small>Camera photo for this observation</small>
            </span>
          </button>
          <button
            type="button"
            className="capture-evidence-button touch-target"
            onClick={openGalleryPicker}
            disabled={isSaving}
          >
            <span className="capture-evidence-icon" aria-hidden="true">
              🖼️
            </span>
            <span>
              <strong>Gallery</strong>
              <small>Add existing supporting images</small>
            </span>
          </button>
        </div>
      </div>

      <div className="standalone-text-note-panel">
        {showTextNoteEditor ? (
          <div className="compact-text-note-editor field-stack">
            <label className="field-stack" htmlFor={`${fileInputId}-text-note`}>
              <span className="label">Text note</span>
              <textarea
                id={`${fileInputId}-text-note`}
                className="input note-textarea"
                value={note}
                placeholder="Type a short evidence note."
                onChange={(event) => setNote(event.target.value)}
                rows={4}
                disabled={isSaving}
              />
            </label>
            <div className="form-actions compact-text-note-actions">
              <button
                type="button"
                className="button button-primary touch-target"
                onClick={handleStandaloneTextNoteSave}
                disabled={isSaving || !note.trim()}
              >
                {isSaving ? "Saving…" : "Save Note"}
              </button>
              {voiceNoteStatus === "listening" ? (
                <button
                  type="button"
                  className="button button-secondary touch-target"
                  onClick={() =>
                    stopVoiceNote(
                      "Voice note stopped. Review your note, then save evidence.",
                    )
                  }
                  disabled={isSaving}
                >
                  Stop Voice Note
                </button>
              ) : null}
              <button
                type="button"
                className="button button-secondary touch-target"
                onClick={cancelStandaloneTextNote}
                disabled={isSaving}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="standalone-note-actions" aria-label="Add notes">
            <button
              type="button"
              className="secondary-link standalone-text-note-toggle touch-target"
              onClick={() => {
                setClientError(null);
                setActionError(null);
                setShowTextNoteEditor(true);
              }}
              disabled={isSaving}
            >
              + Add Text Note
            </button>
            <button
              type="button"
              className="secondary-link standalone-text-note-toggle touch-target"
              onClick={startStandaloneVoiceNote}
              disabled={isSaving}
            >
              + Add Voice Note
            </button>
          </div>
        )}
      </div>

      <div className="field-stack capture-file-field capture-secondary-panel">
        <label htmlFor={fileInputId} className="label visually-hidden">
          Capture evidence file
        </label>
        <input
          ref={fileInputRef}
          key={`${captureIntent}-${activeType}-${preferCameraCapture ? "camera" : "gallery"}`}
          id={fileInputId}
          type="file"
          accept={fileConfig.accept}
          capture={fileConfig.capture}
          multiple={supportsMultipleFiles}
          className="input file-input camera-file-input"
          onChange={validateFileSelection}
          disabled={isSaving}
        />
        {selectedFiles.length > 0 ? (
          <section
            className="observation-workspace-panel"
            aria-label="Active observation workspace"
          >
            <div className="observation-workspace-header">
              <div>
                <p className="eyebrow">Observation</p>
                <h2>Supporting Images</h2>
                <p className="muted">
                  {imageCountLabel}. Review, add, remove, or reorder images
                  without leaving this workspace.
                </p>
              </div>
              <button
                type="button"
                className="button button-primary touch-target observation-add-image-button"
                onClick={openCameraPicker}
                disabled={isSaving}
              >
                + Add Image
              </button>
            </div>

            {observationFiles.length > 0 ? (
              <div
                className="observation-image-gallery"
                aria-label="Supporting image thumbnails"
              >
                {observationFiles.map((file, index) => (
                  <article key={file.id} className="observation-image-tile">
                    <div className="observation-image-frame">
                      {file.type.startsWith("video/") ? (
                        <video
                          src={file.previewUrl}
                          controls
                          preload="metadata"
                          className="evidence-media"
                        />
                      ) : file.type.startsWith("image/") ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={file.previewUrl}
                          alt={`Supporting image ${index + 1} for this observation`}
                          className="evidence-media"
                        />
                      ) : (
                        <div className="evidence-file-placeholder">
                          Preview unavailable
                        </div>
                      )}
                    </div>
                    <div className="observation-image-tile-footer">
                      <span>{index + 1}</span>
                      <span className="muted">
                        {getUploadStatusLabel(file.status, file.error)}
                      </span>
                    </div>
                    <div
                      className="observation-reorder-actions"
                      aria-label={`Reorder image ${index + 1}`}
                    >
                      <button
                        type="button"
                        className="secondary-link"
                        disabled
                        title="Reorder coming soon"
                      >
                        ↕ Reorder
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}

            <div className="field-stack observation-note-panel">
              <span className="label">Technician Note</span>
              {observationFiles.map((file, index) => (
                <label
                  key={file.id}
                  className="field-stack"
                  htmlFor={`file-note-${file.id}`}
                >
                  <span className="muted">Image {index + 1} note</span>
                  <textarea
                    id={`file-note-${file.id}`}
                    className="input note-textarea"
                    value={file.note}
                    placeholder={
                      index === 0
                        ? "Describe the observation, defect, or condition."
                        : "Optional supporting detail for this image."
                    }
                    onChange={(event) =>
                      updateSelectedFileNote(file.id, event.target.value)
                    }
                    rows={3}
                  />
                  <span
                    className={
                      file.noteSaveStatus === "failed" ? "error" : "muted"
                    }
                    role="status"
                    aria-live="polite"
                  >
                    {getNoteSaveStatusLabel(file.noteSaveStatus)}
                  </span>
                </label>
              ))}
            </div>

            <div className="form-actions observation-workspace-actions">
              <button
                type="submit"
                className="button button-primary touch-target"
                disabled={
                  isSaving ||
                  !selectedFiles.some(
                    (file) =>
                      file.status === "queued" ||
                      file.noteSaveStatus === "unsaved" ||
                      file.noteSaveStatus === "failed",
                  )
                }
              >
                {isSaving ? "Saving…" : "Save Observation"}
              </button>
              <button
                type="button"
                className="button button-secondary touch-target"
                onClick={openCameraPicker}
                disabled={isSaving}
              >
                Add Image
              </button>
              {stickyDoneHref ? (
                <Link
                  href={stickyDoneHref}
                  className="button button-secondary touch-target"
                  onClick={handleDoneNavigation}
                >
                  Done
                </Link>
              ) : null}
            </div>
          </section>
        ) : null}

        {failedFiles.length > 0 ? (
          <section className="failed-uploads-panel" aria-label="Failed uploads">
            <div>
              <p className="eyebrow">Failed Uploads</p>
              <h2>Upload Failed</h2>
            </div>
            {failedFiles.map((file) => (
              <article key={file.id} className="failed-upload-card">
                <span className="muted">{file.name}</span>
                <strong>{file.error ?? "Upload failed"}</strong>
                <div className="form-actions">
                  <button
                    type="submit"
                    className="button button-primary touch-target"
                    disabled={isSaving}
                  >
                    Retry Upload
                  </button>
                  <button
                    type="button"
                    className="button button-secondary touch-target danger-link"
                    onClick={() => removeSelectedFile(file.id)}
                    disabled={isSaving}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </section>
        ) : null}
        <p className="muted capture-upload-hint">
          Maximum file size is {captureSizeLabel} per capture file and{" "}
          {videoSizeLabel} per video.
        </p>
      </div>

      {stickyDoneHref ? (
        <div className="guided-sticky-actions focused-capture-done-actions">
          <button
            type="button"
            className="button button-primary touch-target"
            onClick={openCameraPicker}
            disabled={isSaving}
          >
            Camera
          </button>
          {isSaving ? (
            <button
              type="button"
              className="button button-secondary touch-target"
              disabled
            >
              Done
            </button>
          ) : (
            <Link
              href={stickyDoneHref}
              className="button button-secondary touch-target"
              onClick={handleDoneNavigation}
            >
              Done
            </Link>
          )}
        </div>
      ) : null}
    </form>
  );
}
