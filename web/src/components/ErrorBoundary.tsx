// web/src/components/ErrorBoundary.tsx: a screen that fails to draw shows a plain message and a way back, instead
// of a blank page (owner decision D7). App keys it by the URL, so going anywhere else starts it fresh.
import { Component, type ReactNode } from 'react';

interface State { failed: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };
  static getDerivedStateFromError(): State { return { failed: true }; }
  componentDidCatch(error: unknown): void { console.error(error); }        // for the browser's developer console only
  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section role="alert">
        <h1>This screen could not be shown</h1>
        <p>Something went wrong while drawing it. Your submitted answers are saved.</p>
        {/* Already at the start: the URL would not change, so reload to start the screen fresh. */}
        <p><a href="#/" onClick={() => { if ((location.hash || '#/') === '#/') location.reload(); }}>Back to the start</a></p>
      </section>
    );
  }
}
