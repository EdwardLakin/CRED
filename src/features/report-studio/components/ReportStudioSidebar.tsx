"use client";

type ReportStudioSidebarProps<T extends string = string> = {
  sections: readonly T[];
  active: T;
  onSelect: (section: T) => void;
};

export function ReportStudioSidebar<T extends string>({
  sections,
  active,
  onSelect,
}: ReportStudioSidebarProps<T>) {
  return (
    <aside
      className="report-studio-sidebar"
      aria-label="Report Studio sections"
    >
      {sections.map((section) => (
        <button
          type="button"
          key={section}
          className={active === section ? "active" : ""}
          onClick={() => onSelect(section)}
          data-target-section={section}
        >
          {section}
        </button>
      ))}
    </aside>
  );
}
