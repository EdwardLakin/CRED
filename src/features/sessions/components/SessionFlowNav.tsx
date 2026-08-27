"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./SessionFlowNav.module.css";

const SESSION_FLOW_STEPS = [
  { key: "capture", label: "Capture", route: "capture" },
  { key: "review", label: "Review", route: "report" },
  { key: "approve", label: "Approve", route: "approve" },
  { key: "export", label: "Export", route: "export" },
] as const;

export type SessionFlowStep = (typeof SESSION_FLOW_STEPS)[number]["key"];

function getCurrentStep(pathname: string, sessionId: string): SessionFlowStep {
  const sessionRoot = `/dashboard/sessions/${sessionId}`;
  const route = pathname.slice(sessionRoot.length).split("/").filter(Boolean)[0];

  if (route === "capture") return "capture";
  if (route === "approve") return "approve";
  if (route === "export") return "export";

  // Report and optional advanced tools belong to the Review portion of the
  // same four-step flow.
  return "review";
}

export function SessionFlowNav({
  maxAvailableStep,
  sessionId,
}: {
  maxAvailableStep: number;
  sessionId: string;
}) {
  const pathname = usePathname();
  const currentStep = getCurrentStep(pathname, sessionId);
  const currentIndex = SESSION_FLOW_STEPS.findIndex(
    (step) => step.key === currentStep,
  );
  const availableThrough = Math.max(maxAvailableStep, currentIndex);

  return (
    <nav className={styles.nav} aria-label="Session progress">
      <ol className={styles.steps}>
        {SESSION_FLOW_STEPS.map((step, index) => {
          const href = `/dashboard/sessions/${sessionId}/${step.route}`;
          const isCurrent = step.key === currentStep;
          const isComplete = index < currentIndex;
          const isAvailable = index <= availableThrough;
          const content = (
            <>
              <span className={styles.marker} aria-hidden="true">
                {isComplete ? "✓" : index + 1}
              </span>
              <span className={styles.label}>{step.label}</span>
            </>
          );

          return (
            <li
              className={`${styles.step} ${isCurrent ? styles.current : ""} ${isComplete ? styles.complete : ""}`}
              key={step.key}
            >
              {isAvailable ? (
                <Link
                  className={styles.stepLink}
                  href={href}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {content}
                </Link>
              ) : (
                <span
                  className={`${styles.stepLink} ${styles.unavailable}`}
                  aria-disabled="true"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
