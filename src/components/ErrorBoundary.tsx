import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; fallback?: ReactNode; name?: string; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{ padding: 24, margin: 24, border: '1px solid rgba(0,0,0,0.1)', borderRadius: 16, background: '#fff', color: '#1d1d1f', fontFamily: 'system-ui, sans-serif' }} dir="rtl">
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>حدث خطأ غير متوقع</h2>
          <p style={{ margin: '0 0 16px', color: '#6e6e73', fontSize: 14 }}>تعذر عرض هذا الجزء. يمكنك المحاولة مرة أخرى.</p>
          <button type="button" onClick={() => this.setState({ hasError: false, error: undefined })} style={{ height: 40, padding: '0 20px', borderRadius: 12, border: '1px solid rgba(0,0,0,0.12)', background: '#0071e3', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
