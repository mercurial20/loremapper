import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Keeps a failing panel from taking down the whole editor (and the map with it). */
export class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel-error" role="alert">
        <b>{this.props.label} hit a problem.</b>
        <small>{this.state.error.message}</small>
        <button className="btn small" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
