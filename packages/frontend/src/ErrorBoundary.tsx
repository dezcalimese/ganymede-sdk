import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#08090C] text-white flex items-center justify-center p-8">
          <div className="max-w-2xl w-full bg-red-900/20 border border-red-500 p-6 rounded-lg">
            <h1 className="text-2xl font-bold text-red-400 mb-4">Something went wrong</h1>
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-red-300 mb-2">Error:</h2>
              <pre className="bg-black/50 p-4 rounded overflow-auto text-sm text-red-200">
                {this.state.error?.toString()}
              </pre>
            </div>
            {this.state.errorInfo && (
              <div>
                <h2 className="text-lg font-semibold text-red-300 mb-2">Component Stack:</h2>
                <pre className="bg-black/50 p-4 rounded overflow-auto text-xs text-slate-400 max-h-64">
                  {this.state.errorInfo.componentStack}
                </pre>
              </div>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
