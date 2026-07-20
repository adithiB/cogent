import { BrandPanel } from "./brand-panel";

/** cogent-ui-implementation-spec.md §2.1: 2-col grid ≥900px, stacked below. */
export function SplitLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 min-[900px]:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12 min-[900px]:px-12">
        {children}
      </div>
    </div>
  );
}
