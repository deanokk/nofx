import { useState, useRef } from 'react'
import { Sparkles, Loader2, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import type { StrategyConfig, AIModel } from '../../types'
import { t, type Language } from '../../i18n/translations'

const API_BASE = import.meta.env.VITE_API_BASE || ''

interface NLStrategyGeneratorProps {
  onConfigGenerated: (config: StrategyConfig, name: string, description: string) => void
  aiModels: AIModel[]
  selectedModelId: string
  onModelChange: (modelId: string) => void
  language: string
  token: string | null
  disabled?: boolean
}

export function NLStrategyGenerator({
  onConfigGenerated,
  aiModels,
  selectedModelId,
  onModelChange,
  language,
  token,
  disabled,
}: NLStrategyGeneratorProps) {
  const [expanded, setExpanded] = useState(false)
  const [description, setDescription] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const tr = (key: string) => t(`strategyStudio.${key}`, language as Language)

  const handleGenerate = async () => {
    if (!token || !description.trim() || !selectedModelId) return

    setIsGenerating(true)
    setError(null)
    setExplanation(null)

    abortRef.current = new AbortController()

    try {
      const response = await fetch(`${API_BASE}/api/strategies/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          description: description.trim(),
          ai_model_id: selectedModelId,
          language,
        }),
        signal: abortRef.current.signal,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || `Request failed (${response.status})`)
      }

      const data = await response.json()
      setExplanation(data.ai_explanation || null)
      onConfigGenerated(data.config, data.name, data.description)

      // Auto-collapse after success with brief delay to show explanation
      setTimeout(() => setExpanded(false), 2000)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsGenerating(false)
      abortRef.current = null
    }
  }

  const handleCancel = () => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }

  const placeholder = language === 'zh'
    ? '例如：我想做趋势跟踪，BTC/ETH，5倍杠杆，最多亏10%就停'
    : 'e.g., I want a trend-following strategy on BTC/ETH, 5x leverage, stop at 10% loss'

  return (
    <div className="mb-4 rounded-lg overflow-hidden bg-nofx-bg-lighter border border-purple-500/30">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="text-sm font-medium text-purple-300">{tr('nlGenerate')}</span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-nofx-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-nofx-text-muted" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-xs text-nofx-text-muted">{tr('nlGenerateDesc')}</p>

          {/* Description input */}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={placeholder}
            disabled={disabled || isGenerating}
            maxLength={2000}
            className="w-full h-24 px-3 py-2 rounded-lg resize-none text-sm"
            style={{ background: '#0B0E11', border: '1px solid #2B3139', color: '#EAECEF' }}
          />

          {/* Model selector + Generate button */}
          <div className="flex items-center gap-2">
            {aiModels.length > 0 ? (
              <select
                value={selectedModelId}
                onChange={(e) => onModelChange(e.target.value)}
                disabled={isGenerating}
                className="flex-1 px-2 py-1.5 rounded text-xs bg-nofx-bg border border-nofx-gold/20 text-nofx-text outline-none"
              >
                {aiModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} ({model.provider})
                  </option>
                ))}
              </select>
            ) : (
              <span className="flex-1 text-xs text-nofx-danger">{tr('noModel')}</span>
            )}

            {isGenerating ? (
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-nofx-danger/20 border border-nofx-danger/40 text-nofx-danger hover:bg-nofx-danger/30 transition-colors"
              >
                {tr('cancel')}
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!description.trim() || !selectedModelId || disabled}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/20"
              >
                <Sparkles className="w-3 h-3" />
                {tr('nlGenerateBtn')}
              </button>
            )}
          </div>

          {/* Loading state */}
          {isGenerating && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
              <span className="text-xs text-purple-300">{tr('nlGenerating')}</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 p-2 rounded-lg bg-nofx-danger/10 border border-nofx-danger/30">
              <AlertCircle className="w-4 h-4 text-nofx-danger flex-shrink-0 mt-0.5" />
              <span className="text-xs text-nofx-danger">{error}</span>
            </div>
          )}

          {/* Success explanation */}
          {explanation && !error && (
            <div className="p-2 rounded-lg bg-nofx-success/10 border border-nofx-success/30">
              <div className="flex items-center gap-1.5 mb-1">
                <Sparkles className="w-3 h-3 text-nofx-success" />
                <span className="text-xs font-medium text-nofx-success">{tr('nlExplanation')}</span>
              </div>
              <p className="text-xs text-nofx-text-muted">{explanation}</p>
              <p className="text-[10px] text-nofx-success/70 mt-1">{tr('strategyGenerated')}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
