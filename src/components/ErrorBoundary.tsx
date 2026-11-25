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
        <div style={{ padding: 24, margin: 24, border: '1px solid var(--divider, #E3E8EF)', borderRadius: 16, background: 'var(--surface, #fff)', color: 'var(--text, #111827)', fontFamily: 'var(--font-family, system-ui, sans-serif)' }} dir="rtl">
          <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>حدث خطأ غير متوقع</h2>
          <p style={{ margin: '0 0 16px', color: 'var(--text-2, #4B5563)', fontSize: 14 }}>تعذر عرض هذا الجزء. يمكنك المحاولة مرة أخرى.</p>
          <button type="button" onClick={() => this.setState({ hasError: false, error: undefined })} style={{ height: 40, padding: '0 20px', borderRadius: 8, border: '1px solid var(--accent, #0B5FCC)', background: 'var(--accent, #0B5FCC)', color: 'var(--on-accent, #fff)', fontWeight: 600, cursor: 'pointer' }}>
            إعادة المحاولة
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
