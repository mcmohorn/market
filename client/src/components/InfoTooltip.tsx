import type { ReactNode } from "react";

interface Props {
  /** Explanatory content shown on hover/focus. */
  content: ReactNode;
  /** Trigger element. Defaults to a small "info" glyph if omitted, so InfoTooltip
   *  can either wrap an existing label (making the whole label hoverable) or be
   *  dropped in next to one as a standalone icon. */
  children?: ReactNode;
  /** Wider panel for content with more to say (e.g. the confidence breakdown). */
  width?: "sm" | "md" | "lg";
  className?: string;
}

const WIDTH_CLASS: Record<NonNullable<Props["width"]>, string> = {
  sm: "w-48",
  md: "w-64",
  lg: "w-80",
};

/** Pure-CSS hover/focus tooltip — no positioning library needed. The panel is
 *  positioned with `group-hover`/`group-focus-within` off a `relative` wrapper,
 *  and is keyboard-reachable via tabIndex so it's not mouse-only. */
export default function InfoTooltip({ content, children, width = "sm", className = "" }: Props) {
  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      {children ?? (
        <span
          tabIndex={0}
          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-cyber-muted/50 text-cyber-muted text-[9px] leading-none cursor-help hover:border-cyber-green hover:text-cyber-green focus:border-cyber-green focus:text-cyber-green focus:outline-none"
          aria-label="More info"
        >
          i
        </span>
      )}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block group-focus-within:block ${WIDTH_CLASS[width]}`}
      >
        <span className="block bg-cyber-bg border border-cyber-green/40 text-cyber-text text-[11px] leading-snug font-mono rounded shadow-lg shadow-black/50 p-2 whitespace-normal">
          {content}
        </span>
        <span className="block w-2 h-2 bg-cyber-bg border-r border-b border-cyber-green/40 rotate-45 absolute left-1/2 -translate-x-1/2 -bottom-[5px]" />
      </span>
    </span>
  );
}
