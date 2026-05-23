interface Props {
  text: string;
  streaming: boolean;
}

export function AiCommentary({ text, streaming }: Props): JSX.Element {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b te-hairline flex items-center justify-between te-label">
        <span>ai · plan reading</span>
        <span className="text-ink-mute">{streaming ? "streaming…" : `${text.length} chars`}</span>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {text.length === 0 && !streaming && (
          <div className="te-label">click "EXPLAIN IN ENGLISH" on a plan to stream commentary</div>
        )}
        <p className="text-[13px] leading-relaxed text-ink whitespace-pre-wrap">
          {text}
          {streaming && (
            <span
              aria-hidden
              className="inline-block w-[6px] h-[14px] ml-1 align-text-bottom animate-pulse"
              style={{ background: "var(--ink-dim)" }}
            />
          )}
        </p>
      </div>
    </div>
  );
}
