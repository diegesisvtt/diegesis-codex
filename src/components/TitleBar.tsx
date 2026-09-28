import { useRef, useState } from 'react';
import { BookOpen, Plus, ChevronDown, Pencil, Trash2, FileDown, FileUp, Settings2, Type, Upload } from 'lucide-react';
import { useStore } from '../state/store';
import { usePluginManager, useRibbonItems } from '../plugins';
import { Modal, Button } from './ui';
import type { CustomFont, Realm } from '@shared/types';

const generateId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function TitleBar() {
  const { realms, activeRealmId, setActiveRealm, createRealm, renameRealm, deleteRealm, exportRealm, importRealm, uiState, saveUiState } =
    useStore();
  const manager = usePluginManager();
  const ribbonItems = useRibbonItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<Realm | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleting, setDeleting] = useState<Realm | null>(null);
  const [settingsRealm, setSettingsRealm] = useState<Realm | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const active = realms.find((r) => r.id === activeRealmId);

  const doExport = async (realm: Realm) => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await exportRealm(realm.id);
      if (!res.ok && !res.canceled) setTransferError(res.error ?? 'Falha ao exportar o universo.');
    } finally {
      setBusy(false);
    }
  };

  const doImport = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const res = await importRealm();
      if (!res.ok && !res.canceled) setTransferError(res.error ?? 'Falha ao importar o universo.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await deleteRealm(deleting.id);
    setDeleting(null);
  };

  const submitCreate = async () => {
    if (!name.trim()) return;
    await createRealm(name.trim());
    setName('');
    setCreating(false);
  };

  const submitRename = async () => {
    if (!renaming || !renameName.trim()) return;
    await renameRealm(renaming.id, renameName.trim());
    setRenaming(null);
  };

  return (
    <div className="h-11 border-b border-line bg-app flex items-center px-3 shrink-0 justify-between z-20 select-none">
      <div className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-md bg-accent-soft flex items-center justify-center">
          <BookOpen size={13} className="text-accent-ink" />
        </div>
        <span className="font-semibold text-[13px] tracking-tight text-ink-1">Diegesis Codex</span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* ribbon actions contributed by plugins */}
        {ribbonItems.map((item) => {
          const Icon = item.icon;
          const active = item.isActive?.() ?? false;
          return (
            <button
              key={item.id}
              onClick={() => manager.commands.run(item.command)}
              title={item.title}
              className={`flex items-center gap-2 rounded-md transition-colors border ${
                item.label ? 'text-[12px] px-2.5 py-1.5' : 'p-2'
              } ${
                active
                  ? 'text-accent-ink bg-accent-soft border-accent/40'
                  : 'text-ink-3 hover:text-ink-2 hover:bg-hover border-line bg-sidebar'
              }`}
            >
              <Icon size={13} />
              {item.label && <span>{item.label}</span>}
              {item.kbd && (
                <kbd className="text-[10px] text-ink-3 bg-overlay rounded px-1 py-px font-sans">{item.kbd}</kbd>
              )}
            </button>
          );
        })}

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-ink-2 hover:text-ink-1 px-2.5 py-1.5 rounded-md hover:bg-hover transition-colors"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-board" />
            {active?.name ?? 'Sem universo'}
            <ChevronDown size={12} className="text-ink-3" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-40 w-72 bg-elevated border border-line rounded-lg shadow-2xl py-1 overflow-hidden animate-fade-up">
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-ink-3">
                  Universos
                </div>
                {realms.map((r) => (
                  <div
                    key={r.id}
                    className={`group flex items-center gap-1 pr-1 transition-colors ${
                      r.id === activeRealmId ? 'bg-active' : 'hover:bg-hover'
                    }`}
                  >
                    <button
                      onClick={() => {
                        setActiveRealm(r.id);
                        setMenuOpen(false);
                      }}
                      className={`flex-1 min-w-0 text-left px-3 py-1.5 text-[13px] flex items-center gap-2 ${
                        r.id === activeRealmId ? 'text-ink-1' : 'text-ink-2'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          r.id === activeRealmId ? 'bg-accent' : 'bg-line-strong'
                        }`}
                      />
                      <span className="truncate">{r.name}</span>
                    </button>
                    <span className="hidden group-hover:flex group-focus-within:flex items-center shrink-0">
                      <button
                        title="Configurações do universo"
                        disabled={busy}
                        onClick={() => {
                          setSettingsRealm(r);
                          setMenuOpen(false);
                        }}
                        className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-overlay transition-colors disabled:opacity-40"
                      >
                        <Settings2 size={12} />
                      </button>
                      <button
                        title="Renomear universo"
                        disabled={busy}
                        onClick={() => {
                          setRenaming(r);
                          setRenameName(r.name);
                          setMenuOpen(false);
                        }}
                        className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-overlay transition-colors disabled:opacity-40"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        title="Exportar universo"
                        disabled={busy}
                        onClick={() => doExport(r)}
                        className="p-1 rounded text-ink-3 hover:text-ink-1 hover:bg-overlay transition-colors disabled:opacity-40"
                      >
                        <FileDown size={12} />
                      </button>
                      <button
                        title="Excluir universo"
                        disabled={busy}
                        onClick={() => {
                          setDeleting(r);
                          setMenuOpen(false);
                        }}
                        className="p-1 rounded text-ink-3 hover:text-danger hover:bg-overlay transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                      </button>
                    </span>
                  </div>
                ))}
                <div className="border-t border-line mt-1 pt-1">
                  <button
                    onClick={() => {
                      setCreating(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 flex items-center gap-2"
                  >
                    <Plus size={13} /> Novo universo
                  </button>
                  <button
                    onClick={doImport}
                    disabled={busy}
                    className="w-full text-left px-3 py-1.5 text-[13px] text-ink-2 hover:bg-hover hover:text-ink-1 flex items-center gap-2 disabled:opacity-40"
                  >
                    <FileUp size={13} /> Importar universo…
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Modal
        isOpen={creating}
        onClose={() => setCreating(false)}
        title="Novo universo"
        actions={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate}>Criar</Button>
          </>
        }
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate();
          }}
          placeholder="Nome do universo…"
          className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-ink-1 text-sm outline-none focus:border-accent transition-colors"
        />
      </Modal>

      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        title="Renomear universo"
        actions={
          <>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancelar
            </Button>
            <Button onClick={submitRename}>Renomear</Button>
          </>
        }
      >
        <input
          autoFocus
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename();
          }}
          placeholder="Nome do universo…"
          className="w-full bg-sidebar border border-line rounded-md px-3 py-2 text-ink-1 text-sm outline-none focus:border-accent transition-colors"
        />
      </Modal>

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Excluir universo"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Excluir
            </Button>
          </>
        }
      >
        <p>
          Excluir <strong className="text-ink-1">{deleting?.name}</strong>?
        </p>
        <p className="mt-2 text-ink-3 text-[13px]">
          Todos os documentos, PDFs e conversas deste universo serão apagados permanentemente. Esta ação não pode ser
          desfeita.
        </p>
      </Modal>

      <Modal
        isOpen={transferError !== null}
        onClose={() => setTransferError(null)}
        title="Erro na transferência"
        actions={<Button onClick={() => setTransferError(null)}>OK</Button>}
      >
        <p>{transferError}</p>
      </Modal>

      <Modal
        isOpen={settingsRealm !== null}
        onClose={() => setSettingsRealm(null)}
        title={`Configurações — ${settingsRealm?.name ?? ''}`}
        actions={<Button onClick={() => setSettingsRealm(null)}>Fechar</Button>}
      >
        {settingsRealm && (
          <RealmFontsEditor
            fonts={uiState.realmSettings?.[settingsRealm.id]?.fonts ?? []}
            onChange={(fonts) => {
              const realmSettings = {
                ...(uiState.realmSettings ?? {}),
                [settingsRealm.id]: { ...(uiState.realmSettings?.[settingsRealm.id] ?? {}), fonts },
              };
              saveUiState({ realmSettings });
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/** uploads and manages custom fonts for a realm (usable in map labels, notes…) */
function RealmFontsEditor({ fonts, onChange }: { fonts: CustomFont[]; onChange(fonts: CustomFont[]): void }) {
  // multiple async FileReaders must append to the latest list, not a stale closure
  const fontsRef = useRef(fonts);
  fontsRef.current = fonts;
  const [deleting, setDeleting] = useState<CustomFont | null>(null);

  const upload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ttf,.otf,.woff,.woff2';
    input.multiple = true;
    input.onchange = () => {
      for (const file of Array.from(input.files ?? [])) {
        const reader = new FileReader();
        reader.onload = () => {
          const name = file.name.replace(/\.(ttf|otf|woff2?)$/i, '');
          onChange([...fontsRef.current, { id: generateId(), name, src: String(reader.result) }]);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Type size={14} className="text-ink-3" />
        <span className="text-[13px] font-medium text-ink-1">Fontes personalizadas</span>
      </div>
      <p className="text-[12px] text-ink-3 mb-3">
        Arquivos .ttf, .otf, .woff ou .woff2. Ficam disponíveis nos seletores de fonte dos editores (mapas, notas) deste
        universo.
      </p>
      {fonts.length === 0 ? (
        <p className="text-[12px] text-ink-3 italic mb-3">Nenhuma fonte adicionada.</p>
      ) : (
        <div className="space-y-1 mb-3 max-h-48 overflow-y-auto custom-scrollbar">
          {fonts.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-line">
              <span className="flex-1 truncate text-[13px] text-ink-1" style={{ fontFamily: `"${f.name}"` }}>
                {f.name}
              </span>
              <button
                title="Remover fonte"
                onClick={() => setDeleting(f)}
                className="p-1 rounded text-ink-3 hover:text-danger hover:bg-hover"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Remover fonte"
        actions={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) onChange(fonts.filter((x) => x.id !== deleting.id));
                setDeleting(null);
              }}
            >
              Remover
            </Button>
          </>
        }
      >
        <p>
          Remover a fonte <strong className="text-ink-1">{deleting?.name}</strong> deste universo? Textos que a utilizam
          passam a usar a fonte padrão.
        </p>
      </Modal>
      <button
        onClick={upload}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-line text-[12px] text-ink-2 hover:border-accent hover:text-accent transition-colors"
      >
        <Upload size={13} /> Adicionar fonte…
      </button>
    </div>
  );
}
