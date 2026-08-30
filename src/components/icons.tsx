interface IconProps {
  className?: string;
}

/** Icons sit next to a text label, so they are decorative for screen readers. */
const BASE = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BubbleIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M13.5 8.2c0 2.5-2.5 4.5-5.5 4.5-.6 0-1.2-.1-1.8-.2L3 13.8l.9-2.4C3 10.6 2.5 9.5 2.5 8.2c0-2.5 2.5-4.5 5.5-4.5s5.5 2 5.5 4.5Z" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M11.3 2.7a1.4 1.4 0 0 1 2 2L5.6 12.4l-2.7.7.7-2.7 7.7-7.7Z" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M2.8 4.3h10.4M6.2 4.3V3.1c0-.4.3-.8.8-.8h2c.4 0 .8.4.8.8v1.2M4.3 4.3l.5 8.2c0 .6.5 1.1 1.1 1.1h4.2c.6 0 1.1-.5 1.1-1.1l.5-8.2" />
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M12.8 8H3.2M7 3.9 2.9 8 7 12.1" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M9.6 2.6h3.8v3.8M13.4 2.6 7.2 8.8M10.9 9.4v3.1c0 .5-.4.9-.9.9H3.5c-.5 0-.9-.4-.9-.9V6c0-.5.4-.9.9-.9h3.1" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M8 2.5v7M5 6.8 8 9.8l3-3M2.8 12.2h10.4" />
    </svg>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <svg {...BASE} className={className} aria-hidden="true" focusable="false">
      <path d="M8 9.8v-7M5 5.8 8 2.8l3 3M2.8 12.2h10.4" />
    </svg>
  );
}
