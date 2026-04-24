import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import {
  CheckCircle2,
  Copy,
  CreditCard,
  Layers3,
  Rocket,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { ROUTES } from '../../router/paths'

type PaymentChannel = 'base' | 'solana' | 'tempo'
type ActivePaymentChannel = 'base' | 'solana'
type PaymentMode = 'exact' | 'upto'

interface ChannelConfig {
  walletAddress: string
  privateKey: string
  balance: string
  mode: PaymentMode
}

interface PaymentSettingsState {
  activeChannel: ActivePaymentChannel
  channels: Record<ActivePaymentChannel, ChannelConfig>
}

const STORAGE_KEY = 'nofx_claw402_payment_settings_v2'

function randomHex(length: number) {
  const chars = '0123456789abcdef'
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)]
  }
  return output
}

function randomBase58(length: number) {
  const chars =
    '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output += chars[Math.floor(Math.random() * chars.length)]
  }
  return output
}

function createWallet(channel: ActivePaymentChannel): ChannelConfig {
  if (channel === 'base') {
    return {
      walletAddress: `0x${randomHex(40)}`,
      privateKey: `0x${randomHex(64)}`,
      balance: '8.50',
      mode: 'upto',
    }
  }

  return {
    walletAddress: randomBase58(44),
    privateKey: randomBase58(88),
    balance: '0.00',
    mode: 'upto',
  }
}

function createDefaultState(): PaymentSettingsState {
  return {
    activeChannel: 'base',
    channels: {
      base: createWallet('base'),
      solana: createWallet('solana'),
    },
  }
}

function truncate(value: string, start = 8, end = 6) {
  if (value.length <= start + end + 3) return value
  return `${value.slice(0, start)}...${value.slice(-end)}`
}

export function PaymentChannelSettings() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<PaymentChannel>('base')
  const [settings, setSettings] = useState<PaymentSettingsState>(() => {
    if (typeof window === 'undefined') {
      return createDefaultState()
    }

    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (!saved) {
        return createDefaultState()
      }
      const parsed = JSON.parse(saved) as PaymentSettingsState
      if (
        !parsed.channels?.base?.walletAddress ||
        !parsed.channels?.solana?.walletAddress
      ) {
        return createDefaultState()
      }
      return parsed
    } catch {
      return createDefaultState()
    }
  })
  const [draftKeys, setDraftKeys] = useState<Record<ActivePaymentChannel, string>>({
    base: '',
    solana: '',
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const selectedChannel =
    activeTab === 'tempo' ? null : settings.channels[activeTab]

  const activeSummary = useMemo(() => {
    const current = settings.channels[settings.activeChannel]
    return {
      channel: settings.activeChannel,
      mode: current.mode,
      walletAddress: current.walletAddress,
      balance: current.balance,
    }
  }, [settings])

  const updateChannel = (
    channel: ActivePaymentChannel,
    next: Partial<ChannelConfig>
  ) => {
    setSettings((prev) => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channel]: {
          ...prev.channels[channel],
          ...next,
        },
      },
    }))
  }

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`${label}已复制`)
    } catch {
      toast.error('复制失败，请重试')
    }
  }

  const handleReplacePrivateKey = (channel: ActivePaymentChannel) => {
    const nextKey = draftKeys[channel].trim()
    if (!nextKey) {
      toast.error('请先输入新的私钥')
      return
    }

    const current = settings.channels[channel]
    updateChannel(channel, {
      privateKey: nextKey,
      walletAddress: current.walletAddress,
    })
    setDraftKeys((prev) => ({ ...prev, [channel]: '' }))
    toast.success(`${channel === 'base' ? 'Base' : 'Solana'} 默认钱包已更新`)
  }

  const handleRegenerateWallet = (channel: ActivePaymentChannel) => {
    const nextWallet = createWallet(channel)
    updateChannel(channel, nextWallet)
    setDraftKeys((prev) => ({ ...prev, [channel]: '' }))
    toast.success(`${channel === 'base' ? 'Base' : 'Solana'} 默认钱包已重新生成`)
  }

  const handleActivate = (channel: ActivePaymentChannel) => {
    setSettings((prev) => ({
      ...prev,
      activeChannel: channel,
    }))
    toast.success(
      `${channel === 'base' ? 'Base' : 'Solana'} / ${
        settings.channels[channel].mode === 'upto' ? 'Upto' : 'Exact'
      } 已设为当前支付方式`
    )
  }

  const renderChannelTab = (channel: PaymentChannel) => {
    const selected = activeTab === channel
    const isTempo = channel === 'tempo'
    const isActive = channel !== 'tempo' && settings.activeChannel === channel

    return (
      <button
        key={channel}
        type="button"
        onClick={() => setActiveTab(channel)}
        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
          selected
            ? 'border-nofx-gold/50 bg-nofx-gold/10'
            : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700'
        } ${isTempo ? 'opacity-80' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {channel === 'base' ? (
              <Layers3 className="h-4 w-4 text-nofx-gold" />
            ) : channel === 'solana' ? (
              <Rocket className="h-4 w-4 text-violet-300" />
            ) : (
              <Sparkles className="h-4 w-4 text-amber-300" />
            )}
            <span className="text-sm font-semibold text-white">
              {channel === 'base'
                ? 'Base'
                : channel === 'solana'
                  ? 'Solana'
                  : 'Tempo'}
            </span>
          </div>

          {isTempo ? (
            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
              即将支持
            </span>
          ) : isActive ? (
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
              当前使用
            </span>
          ) : null}
        </div>
        <div className="mt-2 text-xs leading-5 text-zinc-400">
          {channel === 'base'
            ? '推荐默认通道，适合作为第一条 Claw402 支付链路。'
            : channel === 'solana'
              ? '与 Base 并列的支付通道，支持独立默认钱包与支付模式。'
              : '页面入口先保留，后续接入 Tempo 支付。'}
        </div>
      </button>
    )
  }

  return (
    <div className="min-h-screen px-4 pb-12 pt-24" style={{ background: '#0B0E11' }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top_left,_rgba(240,185,11,0.16),_transparent_34%),linear-gradient(135deg,rgba(18,18,18,0.95),rgba(10,10,10,0.92))] px-6 py-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] sm:px-8 sm:py-8">
          <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr] lg:items-end">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-nofx-gold/20 bg-nofx-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-nofx-gold">
                <ShieldCheck className="h-3.5 w-3.5" />
                Claw402 支付通道
              </div>
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                先完成支付设置，再配置 AI 模型与策略
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-300 sm:text-[15px]">
                这里管理 Claw402 的统一支付方式。当前支付通道会同时用于 Claw402
                AI 模型、NofxAI 数据源，以及所有交易员。系统会先为每条通道自动生成默认钱包，你只需要充值，或在这里输入私钥替换默认钱包。
              </p>
            </div>

            <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
              <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">
                当前支付方式
              </div>
              <div className="mt-3 flex items-center gap-2 text-xl font-semibold text-white">
                <CreditCard className="h-5 w-5 text-emerald-300" />
                {activeSummary.channel === 'base' ? 'Base' : 'Solana'} /{' '}
                {activeSummary.mode === 'upto' ? 'Upto' : 'Exact'}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-emerald-300">
                  余额 {activeSummary.balance}{' '}
                  {activeSummary.channel === 'base' ? 'USDC' : 'USD'}
                </span>
                <span className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-sky-300">
                  {truncate(activeSummary.walletAddress)}
                </span>
              </div>
              <div className="mt-4 text-xs leading-6 text-zinc-400">
                保存后立即生效。后续如果你在 AI 模型中选择 Claw402，或在策略里启用
                NofxAI 数据源，系统都会读取这里的全局支付设置。
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">{(['base', 'solana', 'tempo'] as PaymentChannel[]).map(renderChannelTab)}</div>

        {activeTab === 'tempo' ? (
          <div className="rounded-[28px] border border-amber-500/20 bg-amber-500/5 p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-300" />
              <div>
                <div className="text-lg font-semibold text-white">Tempo</div>
                <div className="mt-1 text-sm leading-6 text-zinc-400">
                  Tempo 的产品入口已经预留，后续会和 Base、Solana 保持相同的配置体验。
                </div>
              </div>
            </div>
          </div>
        ) : selectedChannel ? (
          <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
            <div className="space-y-6 rounded-[28px] border border-white/8 bg-zinc-950/75 p-6 sm:p-7">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                    默认钱包
                  </div>
                  <h2 className="mt-2 text-2xl font-semibold text-white">
                    {activeTab === 'base' ? 'Base' : 'Solana'} 支付钱包
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-zinc-400">
                    系统已自动为你创建默认钱包。你可以直接使用当前钱包充值，也可以输入新的私钥替换默认钱包。
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                  已自动创建
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-[1fr,220px]">
                <div className="space-y-4">
                  <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        钱包地址
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(selectedChannel.walletAddress, '地址')}
                        className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-[11px] text-zinc-300 transition hover:border-zinc-600 hover:text-white"
                      >
                        <Copy className="h-3 w-3" />
                        复制
                      </button>
                    </div>
                    <div className="mt-3 break-all font-mono text-sm text-white">
                      {selectedChannel.walletAddress}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                      替换默认钱包
                    </div>
                    <div className="mt-3">
                      <input
                        type="text"
                        value={draftKeys[activeTab]}
                        onChange={(e) =>
                          setDraftKeys((prev) => ({
                            ...prev,
                            [activeTab]: e.target.value,
                          }))
                        }
                        placeholder={selectedChannel.privateKey}
                        className="w-full rounded-2xl border border-zinc-700 bg-zinc-950/80 px-4 py-3 font-mono text-sm text-white placeholder:text-zinc-500 focus:border-nofx-gold/40 focus:outline-none"
                      />
                      <div className="mt-2 text-xs leading-6 text-zinc-500">
                        不输入则继续使用当前默认钱包。输入新的私钥后保存，即可替换当前默认钱包。
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleReplacePrivateKey(activeTab)}
                        className="rounded-2xl bg-nofx-gold px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-400"
                      >
                        保存新的私钥
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRegenerateWallet(activeTab)}
                        className="rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-white"
                      >
                        重新生成默认钱包
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                    充值
                  </div>
                  <div className="mt-4 flex justify-center rounded-[24px] border border-white/10 bg-white p-4">
                    <QRCodeSVG value={selectedChannel.walletAddress} size={148} level="M" />
                  </div>
                  <div className="mt-4 text-center">
                    <div className="text-[13px] font-medium text-zinc-300">
                      扫码或复制地址充值
                    </div>
                    <div className="mt-2 text-[12px] leading-6 text-zinc-500">
                      {activeTab === 'base'
                        ? '请充值 Base 链 USDC'
                        : '请充值 Solana 通道所需稳定币'}
                    </div>
                    <div className="mt-4 rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.18em] text-emerald-400">
                        当前余额
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-emerald-300">
                        {selectedChannel.balance}{' '}
                        {activeTab === 'base' ? 'USDC' : 'USD'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6 rounded-[28px] border border-white/8 bg-zinc-950/75 p-6 sm:p-7">
              <div>
                <div className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  支付模式
                </div>
                <h2 className="mt-2 text-2xl font-semibold text-white">
                  默认使用 Upto
                </h2>
                <p className="mt-2 text-sm leading-7 text-zinc-400">
                  先用 Upto 作为默认模式，更适合连续的 AI 调用和数据请求。需要更保守的支付方式时，再切换到 Exact。
                </p>
              </div>

              <div className="space-y-3">
                {(['upto', 'exact'] as PaymentMode[]).map((mode) => {
                  const selected = selectedChannel.mode === mode
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateChannel(activeTab, { mode })}
                      className={`w-full rounded-[24px] border p-4 text-left transition-all ${
                        selected
                          ? 'border-nofx-gold/45 bg-nofx-gold/10'
                          : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {mode === 'upto' ? 'Upto' : 'Exact'}
                          </div>
                          <div className="mt-1 text-sm leading-6 text-zinc-400">
                            {mode === 'upto'
                              ? '推荐默认模式。减少频繁确认，更适合高频 AI 调用与连续数据访问。'
                              : '更偏向精确控制。每次支付都更明确，适合希望保守使用的场景。'}
                          </div>
                        </div>
                        {selected ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 text-nofx-gold" />
                        ) : null}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-[24px] border border-white/8 bg-black/20 p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  生效范围
                </div>
                <div className="mt-3 space-y-2 text-sm text-zinc-300">
                  <div>Claw402 AI 模型</div>
                  <div>NofxAI 数据源</div>
                  <div>所有交易员统一复用</div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleActivate(activeTab)}
                  className="w-full rounded-2xl bg-nofx-gold px-4 py-3 text-sm font-semibold text-black transition hover:bg-yellow-400"
                >
                  设为当前支付方式
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.traders)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-white"
                >
                  去配置 AI 模型和交易员
                </button>
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.strategy)}
                  className="w-full rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-600 hover:text-white"
                >
                  去配置策略
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
