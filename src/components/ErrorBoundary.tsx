// ErrorBoundary minimal: captura erros de render de um editor e exibe a
// mensagem real (em vez de desmontar a árvore inteira do app). O botão
// "Tentar novamente" re-renderiza o filho após a causa raiz ser corrigida.
import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ label?: string; children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', this.props.label ?? 'editor', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center p-6">
          <div className="max-w-lg w-full rounded-xl border border-danger/40 bg-danger/10 p-4">
            <div className="text-[13px] font-semibold text-danger mb-2">
              Erro ao renderizar {this.props.label ?? 'este editor'}
            </div>
            <pre className="text-left text-[11px] font-mono text-ink-2 whitespace-pre-wrap break-all leading-relaxed">
              {this.state.error.message}
              {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="mt-3 text-[12px] text-ink-3 hover:text-ink-1 border border-line rounded-md px-2.5 py-1 transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
