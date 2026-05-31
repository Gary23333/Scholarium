import { useEffect } from 'react';
import { Save, Loader2, CheckCircle2, XCircle, GraduationCap } from 'lucide-react';
import { useStore } from '../lib/store';
import { LLMConfigPanel } from './LLMConfigPanel';
import { AgentModelRouting } from './AgentModelRouting';

export function SettingsPage() {
  const { configLoaded, loadFromBackend, saveToBackend, saveStatus, saveError } = useStore();

  useEffect(() => {
    if (!configLoaded) {
      loadFromBackend();
    }
  }, [configLoaded, loadFromBackend]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-6 w-6 text-emerald-400" />
            <div>
              <h1 className="text-lg font-semibold">Scholarium 星庐</h1>
              <p className="text-xs text-zinc-500">多Agent协奏的学术星河</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === 'success' && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已落印
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <XCircle className="h-3.5 w-3.5" />
                {saveError}
              </span>
            )}
            <button
              onClick={saveToBackend}
              disabled={saveStatus === 'saving'}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
            >
              {saveStatus === 'saving' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              落印配置
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* LLM Config Panel */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden" style={{ height: 600 }}>
          <LLMConfigPanel />
        </div>

        {/* Agent Model Routing */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <AgentModelRouting />
        </div>
      </main>
    </div>
  );
}
