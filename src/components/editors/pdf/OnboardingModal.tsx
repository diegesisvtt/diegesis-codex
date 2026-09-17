import { useState } from 'react';
import { MapPin, Highlighter, Compass, Sparkles, ChevronLeft, ChevronRight, X } from 'lucide-react';

const STEPS = [
  {
    icon: MapPin,
    title: 'Pins que viram notas',
    body: 'Clique com o botão direito em qualquer página para soltar um pin (Monstro, NPC, Armadilha…). Cada pin é uma nota real do seu universo: edite aqui ou abra numa aba, e ela entra na busca e na IA.',
  },
  {
    icon: Highlighter,
    title: 'Destaques com nome',
    body: 'Selecione texto no PDF para destacar com cores — inclusive redação (preto opaco). Dê um nome para cada cor (“Tesouro”, “Perigo”) e converta trechos em notas com um clique.',
  },
  {
    icon: Compass,
    title: 'Navegação de mestre',
    body: 'Sumário, busca no PDF (Ctrl+F), modo duas páginas com capa separada, filtros de leitura (Shift+I), rotação por página, tela cheia (F11) e histórico de navegação na borda esquerda (tecla `).',
  },
  {
    icon: Sparkles,
    title: 'Tudo indexado',
    body: 'O texto do PDF alimenta a busca global (Ctrl+K) e o chat de IA. Pergunte “qual a CD da armadilha da sala 3?” e a resposta vem com a fonte.',
  },
];

export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const last = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in" onClick={onClose}>
      <div
        className="w-[420px] bg-elevated border border-line rounded-2xl shadow-2xl p-6 animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center">
            <Icon size={20} className="text-accent-ink" />
          </div>
          <button className="p-1 text-ink-3 hover:text-ink-1 rounded hover:bg-hover" onClick={onClose} title="Pular">
            <X size={16} />
          </button>
        </div>
        <h2 className="text-[16px] font-semibold text-ink-1 mb-1.5">{current.title}</h2>
        <p className="text-[13px] text-ink-2 leading-relaxed mb-6">{current.body}</p>
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 rounded-full ${i === step ? 'bg-accent' : 'bg-overlay'}`} />
            ))}
          </div>
          <div className="flex gap-1.5">
            {step > 0 && (
              <button
                className="flex items-center gap-1 text-[12.5px] text-ink-2 hover:text-ink-1 px-2.5 py-1.5 rounded-md hover:bg-hover"
                onClick={() => setStep(step - 1)}
              >
                <ChevronLeft size={14} /> Voltar
              </button>
            )}
            <button
              className="flex items-center gap-1 text-[12.5px] font-medium text-white bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-md"
              onClick={() => (last ? onClose() : setStep(step + 1))}
            >
              {last ? 'Começar' : 'Próximo'} {!last && <ChevronRight size={14} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
