// Persistent contact strip in the TopBar / landing header so every
// visitor (any page, any source) is one click from LinkedIn / email /
// GitHub / portfolio. Inline SVGs since lucide-react doesn't ship
// branded icons in this version. (#118)

const LINKEDIN = "https://linkedin.com/in/pritika-priyadarshini";
const EMAIL = "pritikaapriyadarshini@gmail.com";
const GITHUB = "https://github.com/pritika292";
const PORTFOLIO = "https://pritika.studio";

interface LinkSpec {
  href: string;
  label: string;
  icon: JSX.Element;
}

const LINKS: LinkSpec[] = [
  {
    href: LINKEDIN,
    label: "LinkedIn",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px]">
        <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zm-1.78 13.02h3.55V9H3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0z" />
      </svg>
    ),
  },
  {
    href: `mailto:${EMAIL}`,
    label: "Email",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-[18px] w-[18px]"
      >
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
      </svg>
    ),
  },
  {
    href: GITHUB,
    label: "GitHub",
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-[18px] w-[18px]">
        <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.09 3.29 9.41 7.86 10.94.58.1.79-.25.79-.55 0-.27-.01-.99-.02-1.94-3.2.69-3.88-1.54-3.88-1.54-.52-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.7.08-.7 1.16.08 1.78 1.19 1.78 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.74-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18.92-.26 1.91-.39 2.89-.39.98 0 1.97.13 2.89.39 2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.8 1.18 1.83 1.18 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.77 1.07.77 2.16 0 1.56-.01 2.81-.01 3.19 0 .3.21.66.8.55C20.71 21.4 24 17.09 24 12 24 5.65 18.85.5 12.5.5z" />
      </svg>
    ),
  },
  {
    href: PORTFOLIO,
    label: "Portfolio",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="h-[18px] w-[18px]"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </svg>
    ),
  },
];

export function ContactStrip(): JSX.Element {
  return (
    <div className="flex items-center gap-2" aria-label="Pritika's contact links">
      {LINKS.map((l) => {
        const isMail = l.href.startsWith("mailto:");
        const isEmail = l.label === "Email";
        return (
          <a
            key={l.label}
            href={l.href}
            target={isMail ? undefined : "_blank"}
            rel={isMail ? undefined : "noopener"}
            aria-label={l.label}
            title={l.label}
            className={"te-button !px-2.5 !py-2 " + (isEmail ? "!gap-2 !text-[13px]" : "")}
          >
            {l.icon}
            {/* Email shows the full address inline on sm+ so it's
                unmissable for recruiters (#121). Below sm collapses
                to icon-only to keep the header compact. */}
            {isEmail && <span className="hidden sm:inline te-mono">{EMAIL}</span>}
          </a>
        );
      })}
    </div>
  );
}
