import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = {};

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error): void {
    // eslint-disable-next-line no-console
    console.error("[pg-inspector] client crash", error);
  }

  reset = (): void => this.setState({});

  copyDetails = async (): Promise<void> => {
    if (!this.state.error) return;
    try {
      await navigator.clipboard.writeText(
        `${this.state.error.name}: ${this.state.error.message}\n${this.state.error.stack ?? ""}`,
      );
    } catch {
      // ignore
    }
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="h-screen grid place-items-center bg-[var(--surface)] text-ink p-6">
        <div className="te-panel max-w-md w-full p-6">
          <p className="te-label">crash</p>
          <h1 className="mt-2 font-mono text-[15px] uppercase tracking-widest">something broke</h1>
          <p className="mt-3 text-[13px] text-ink-dim">
            The page hit an unexpected error. Refresh to try again, or copy the details below and
            ping me.
          </p>
          <pre className="mt-4 te-mono text-[11px] text-ink-mute whitespace-pre-wrap break-words max-h-40 overflow-auto">
            {this.state.error.message}
          </pre>
          <div className="mt-4 flex gap-1.5">
            <button type="button" onClick={this.copyDetails} className="te-button">
              COPY DETAILS
            </button>
            <button
              type="button"
              onClick={() => {
                this.reset();
                location.reload();
              }}
              className="te-button te-button-primary"
            >
              REFRESH
            </button>
          </div>
        </div>
      </div>
    );
  }
}
