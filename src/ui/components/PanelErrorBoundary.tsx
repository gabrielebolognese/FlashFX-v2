import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  name: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn(`[FlashFX] ${this.props.name} crashed:`, error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full bg-[#0e1c32] p-4 gap-3">
          <AlertTriangle size={20} className="text-amber-400" />
          <span className="text-[11px] text-slate-400 text-center">
            {this.props.name} encountered an error
          </span>
          <span className="text-[10px] text-slate-600 text-center max-w-[200px] break-all">
            {this.state.error?.message?.slice(0, 120)}
          </span>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1 px-2 py-1 rounded bg-[#1a2a42] text-[10px] text-slate-300 hover:bg-[#242a3a] transition-colors"
          >
            <RefreshCw size={10} />
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
