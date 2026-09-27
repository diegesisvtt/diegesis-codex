export { PLUGIN_API_VERSION } from './api/types';
export type {
  AppFacade,
  Disposable,
  Plugin,
  PluginContext,
  PluginManifest,
  PluginPermission,
  PluginSettings,
  ViewComponent,
  ViewProps,
} from './api/types';
export type { AppEvents, EventBus, TypedEventBus } from './api/events';
export type { Command, CommandRegistry } from './api/commands';
export type { RibbonItem, ViewContribution, ViewLocation, ViewRegistry } from './api/views';
export type { EditorComponent, EditorContribution, EditorProps, EditorRegistry } from './api/editors';
export {
  PluginManager,
  PluginProvider,
  useCommands,
  useEditor,
  useExternalPlugins,
  usePluginEvent,
  usePluginManager,
  usePlugins,
  useRibbonItems,
  useViews,
  type ExternalPluginsHandle,
  type PluginInfo,
} from './manager';
export type { ExternalAppFacade, ExternalDocsApi } from './external/sandbox';
export { builtinPlugins } from './builtin';
