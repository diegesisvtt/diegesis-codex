// Custom BlockNote block: AI-generated image. The empty state is a compact
// prompt form (model/LoRA/size options in a collapsible); while generating it
// shows live progress from the backend; the done state shows the image with a
// small toolbar (regenerate, copy prompt). Images live on disk via the
// diegesis-image:// protocol — never base64 in the document.
import { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { ChevronDown, ChevronUp, Copy, ImagePlus, Loader2, RefreshCw, Wand2, X } from 'lucide-react';
import type { ImageGenLora } from '@shared/types';
import { ConfirmDialog } from '../../ui';

interface GenProps {
  url: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  /** JSON string: ImageGenLora[] */
  loras: string;
  seed: number;
  width: number;
  height: number;
  steps: number;
}

const SIZE_PRESETS: { label: string; width: number; height: number }[] = [
  { label: 'Quadrado', width: 1024, height: 1024 },
  { label: 'Retrato', width: 832, height: 1216 },
  { label: 'Paisagem', width: 1216, height: 832 },
];

function parseLoras(raw: string): ImageGenLora[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l): l is ImageGenLora => !!l && typeof l === 'object' && typeof (l as ImageGenLora).name === 'string'
    );
  } catch {
    return [];
  }
}

export const GeneratedImageBlock = createReactBlockSpec(
  {
    type: 'generatedImage',
    propSchema: {
      url: { default: '' },
      prompt: { default: '' },
      negativePrompt: { default: '' },
      model: { default: '' },
      loras: { default: '' },
      seed: { default: -1 },
      width: { default: 1024 },
      height: { default: 1024 },
      steps: { default: 0 },
    },
    content: 'none',
  },
  {
    render: ({ block, editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const props = block.props as any as GenProps;
      const [busy, setBusy] = useState(false);
      const [stage, setStage] = useState('');
      const [error, setError] = useState<string | null>(null);
      const [advanced, setAdvanced] = useState(false);
      const [confirmRegen, setConfirmRegen] = useState(false);
      const [promptDraft, setPromptDraft] = useState(props.prompt);
      const [models, setModels] = useState<string[]>([]);
      const [availableLoras, setAvailableLoras] = useState<string[]>([]);
      const [copied, setCopied] = useState(false);
      const jobRef = useRef<string | null>(null);

      /** fresh props at call time — block.props can be stale in async handlers */
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const currentProps = (): GenProps => ({ ...((editor.getBlock(block.id)?.props ?? block.props) as any) });

      useEffect(
        () =>
          window.diegesis.imagegen.onProgress((p) => {
            if (p.jobId === jobRef.current) setStage(p.stage);
          }),
        []
      );

      // model/LoRA pickers are populated lazily, only when the user opens the
      // advanced section (avoids hitting the backend for every block render)
      useEffect(() => {
        if (!advanced) return;
        window.diegesis.imagegen.listModels().then(setModels).catch(() => {});
        window.diegesis.imagegen.listLoras().then(setAvailableLoras).catch(() => {});
      }, [advanced]);

      // keep the draft in sync when the prompt changes externally (undo/redo,
      // AI tool edits, live reload) — updates are idempotent with onBlur writes
      useEffect(() => {
        setPromptDraft(props.prompt);
      }, [props.prompt]);

      const setProps = (patch: Partial<GenProps>) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.updateBlock(block, { props: { ...currentProps(), ...patch } as any });

      const toggleLora = (name: string) => {
        const list = parseLoras(currentProps().loras);
        const next = list.some((l) => l.name === name)
          ? list.filter((l) => l.name !== name)
          : [...list, { name, strength: 1 }];
        setProps({ loras: next.length ? JSON.stringify(next) : '' });
      };

      const setLoraStrength = (name: string, strength: number) => {
        const list = parseLoras(currentProps().loras).map((l) => (l.name === name ? { ...l, strength } : l));
        setProps({ loras: JSON.stringify(list) });
      };

      const generate = async (newSeed: boolean) => {
        const p = currentProps();
        const prompt = promptDraft.trim();
        if (!prompt || jobRef.current) return;
        const jobId = crypto.randomUUID();
        jobRef.current = jobId;
        setBusy(true);
        setError(null);
        setStage('Iniciando…');
        try {
          const loras = parseLoras(p.loras);
          const result = await window.diegesis.imagegen.generate({
            jobId,
            prompt,
            negativePrompt: p.negativePrompt || undefined,
            model: p.model || undefined,
            loras: loras.length ? loras : undefined,
            width: p.width,
            height: p.height,
            steps: p.steps || undefined,
            seed: newSeed ? -1 : p.seed,
          });
          if (result.cancelled) return; // user-cancelled: back to the form, no error
          if (!result.ok || !result.images?.length) {
            setError(result.error ?? 'Falha ao gerar a imagem.');
            return;
          }
          setProps({ url: result.images[0].url, seed: result.images[0].seed ?? -1, prompt });
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy(false);
          jobRef.current = null;
        }
      };

      const copyPrompt = () => {
        void navigator.clipboard.writeText(currentProps().prompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      };

      if (busy) {
        return (
          <div className="w-full my-1 px-3 py-4 rounded-lg border border-line bg-elevated/95 shadow-xl">
            <div className="flex items-center gap-2 text-[13px] text-ink-2">
              <Loader2 size={15} className="animate-spin text-accent-ink" />
              <span className="flex-1 truncate">{stage || 'Gerando…'}</span>
              <button
                onClick={() => jobRef.current && window.diegesis.imagegen.cancel(jobRef.current)}
                className="p-1 rounded text-ink-3 hover:text-danger hover:bg-danger-soft transition-colors"
                title="Cancelar geração"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        );
      }

      if (props.url) {
        return (
          <div className="w-full my-1 rounded-lg border border-line bg-elevated/95 shadow-xl overflow-hidden">
            <img src={props.url} alt={props.prompt} className="w-full block" draggable={false} />
            <div className="flex items-center gap-1.5 px-3 py-2">
              <span className="flex-1 truncate text-[11px] text-ink-3" title={props.prompt}>
                {props.prompt}
              </span>
              <button
                onClick={() => setConfirmRegen(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-ink-3 hover:text-ink-1 hover:bg-accent-soft/40 transition-colors"
                title="Regenerar com uma nova seed"
              >
                <RefreshCw size={12} /> Regenerar
              </button>
              <button
                onClick={copyPrompt}
                className="flex items-center gap-1 px-2 py-1 rounded text-[11px] text-ink-3 hover:text-ink-1 hover:bg-accent-soft/40 transition-colors"
                title="Copiar prompt"
              >
                <Copy size={12} /> {copied ? 'Copiado!' : 'Prompt'}
              </button>
            </div>
            <ConfirmDialog
              open={confirmRegen}
              title="Regenerar imagem"
              message="A imagem atual será substituída por uma nova geração (nova seed). Deseja continuar?"
              confirmLabel="Regenerar"
              onConfirm={() => void generate(true)}
              onClose={() => setConfirmRegen(false)}
            />
          </div>
        );
      }

      const selectedLoras = parseLoras(props.loras);

      return (
        <div className="w-full my-1 px-3 py-2.5 rounded-lg border border-dashed border-line-strong bg-elevated/60">
          <div className="flex items-center gap-2">
            <ImagePlus size={15} className="shrink-0 text-accent-ink" strokeWidth={1.75} />
            <input
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              onBlur={() => {
                if (promptDraft !== props.prompt) setProps({ prompt: promptDraft });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void generate(true);
              }}
              placeholder="Descreva a imagem a gerar… (Enter para gerar)"
              className="flex-1 min-w-0 bg-transparent text-[13px] text-ink-1 placeholder-ink-3 outline-none"
            />
            <button
              onClick={() => void generate(true)}
              disabled={!promptDraft.trim()}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-accent text-white text-[12px] font-medium hover:brightness-110 disabled:opacity-40 transition"
            >
              <Wand2 size={12} /> Gerar
            </button>
            <button
              onClick={() => setAdvanced((v) => !v)}
              className="p-1 rounded text-ink-3 hover:text-ink-1 transition-colors"
              title="Modelo, LoRAs e tamanho"
            >
              {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {advanced && (
            <div className="flex flex-col gap-2.5 mt-2.5 pt-2.5 border-t border-line">
              <input
                value={props.negativePrompt}
                onChange={(e) => setProps({ negativePrompt: e.target.value })}
                placeholder="Prompt negativo (opcional)"
                className="w-full bg-sidebar border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors"
              />

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-ink-3 w-14 shrink-0">Modelo</span>
                <input
                  value={props.model}
                  onChange={(e) => setProps({ model: e.target.value })}
                  placeholder="padrão do backend"
                  list={`imagegen-models-${block.id}`}
                  className="flex-1 min-w-0 bg-sidebar border border-line rounded-md px-2.5 py-1.5 text-[12px] text-ink-1 placeholder-ink-3 outline-none focus:border-accent transition-colors"
                />
                <datalist id={`imagegen-models-${block.id}`}>
                  {models.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              {availableLoras.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] text-ink-3">LoRAs</span>
                  <div className="max-h-36 overflow-y-auto flex flex-col gap-1 pr-1">
                    {availableLoras.map((name) => {
                      const active = selectedLoras.find((l) => l.name === name);
                      return (
                        <div key={name} className="flex items-center gap-2">
                          <button
                            onClick={() => toggleLora(name)}
                            className={`flex-1 min-w-0 text-left truncate px-2 py-1 rounded text-[11.5px] border transition-colors ${
                              active
                                ? 'border-accent/60 bg-accent-soft/40 text-ink-1'
                                : 'border-line text-ink-3 hover:text-ink-1 hover:border-line-strong'
                            }`}
                            title={name}
                          >
                            {name}
                          </button>
                          {active && (
                            <input
                              type="number"
                              min={0}
                              max={2}
                              step={0.1}
                              value={active.strength}
                              onChange={(e) => setLoraStrength(name, Number(e.target.value) || 0)}
                              title="Força da LoRA"
                              className="w-14 shrink-0 bg-sidebar border border-line rounded-md px-1.5 py-1 text-[11px] text-ink-1 outline-none focus:border-accent"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-ink-3 w-14 shrink-0">Tamanho</span>
                {SIZE_PRESETS.map((s) => (
                  <button
                    key={s.label}
                    onClick={() => setProps({ width: s.width, height: s.height })}
                    className={`px-2 py-1 rounded text-[11px] border transition-colors ${
                      props.width === s.width && props.height === s.height
                        ? 'border-accent/60 bg-accent-soft/40 text-ink-1'
                        : 'border-line text-ink-3 hover:text-ink-1'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={150}
                  value={props.steps || ''}
                  onChange={(e) => setProps({ steps: Number(e.target.value) || 0 })}
                  placeholder="steps"
                  title="Steps (vazio = padrão do backend)"
                  className="w-16 bg-sidebar border border-line rounded-md px-1.5 py-1 text-[11px] text-ink-1 outline-none focus:border-accent"
                />
              </div>
            </div>
          )}

          {error && <div className="text-[11px] text-danger mt-2">{error}</div>}
        </div>
      );
    },
  }
);
