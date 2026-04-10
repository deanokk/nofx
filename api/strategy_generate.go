package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"nofx/logger"
	"nofx/mcp"
	"nofx/store"
	"regexp"
	"strings"
	"unicode"

	"github.com/gin-gonic/gin"
)

// GenerateStrategyRequest request body for natural language strategy generation
type GenerateStrategyRequest struct {
	Description string `json:"description" binding:"required"`
	AIModelID   string `json:"ai_model_id" binding:"required"`
	Language    string `json:"language"`
}

// GenerateStrategyResponse response for strategy generation
type GenerateStrategyResponse struct {
	Config        store.StrategyConfig `json:"config"`
	Name          string               `json:"name"`
	Description   string               `json:"description"`
	AIExplanation string               `json:"ai_explanation"`
	Warnings      []string             `json:"warnings,omitempty"`
}

// handleGenerateStrategy generates a StrategyConfig from natural language description using AI
func (s *Server) handleGenerateStrategy(c *gin.Context) {
	userID := c.GetString("user_id")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req GenerateStrategyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description and ai_model_id are required"})
		return
	}

	// Validate description length
	if len(req.Description) > 2000 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "description must be 2000 characters or less"})
		return
	}

	// Normalize language
	lang := "zh"
	if req.Language == "en" {
		lang = "en"
	}

	// Get AI model
	model, err := s.store.AIModel().Get(userID, req.AIModelID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("AI model not found: %v", err)})
		return
	}
	if !model.Enabled {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("AI model %s is not enabled", model.Name)})
		return
	}
	if model.APIKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("AI model %s is missing API Key", model.Name)})
		return
	}

	// Create AI client (same pattern as runRealAITest)
	aiClient := mcp.NewAIClientByProvider(model.Provider)
	if aiClient == nil {
		aiClient = mcp.NewClient()
	}
	switch model.Provider {
	case "claw402":
		aiClient.SetAPIKey(string(model.APIKey), "", model.CustomModelName)
	default:
		aiClient.SetAPIKey(string(model.APIKey), model.CustomAPIURL, model.CustomModelName)
	}

	// Build system prompt
	systemPrompt := buildStrategyGenerateSystemPrompt(lang)

	// Call AI
	response, err := aiClient.CallWithMessages(systemPrompt, req.Description)
	if err != nil {
		logger.Errorf("Strategy generate AI call failed: %v", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "AI service call failed, please try again"})
		return
	}

	// Extract JSON from AI response
	jsonStr, explanation := extractStrategyJSON(response)
	if jsonStr == "" {
		logger.Warnf("Strategy generate: no valid JSON in AI response: %s", response)
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":       "AI did not return valid configuration. Please try describing your strategy in more detail.",
			"ai_response": response,
		})
		return
	}

	// Parse AI JSON into raw map to preserve which keys AI actually set
	var rawEnvelope map[string]json.RawMessage
	if err := json.Unmarshal([]byte(jsonStr), &rawEnvelope); err != nil {
		logger.Warnf("Strategy generate: failed to parse JSON: %v\nJSON: %s", err, jsonStr)
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":       "AI response could not be parsed. Please try again with a clearer description.",
			"ai_response": response,
		})
		return
	}

	// Extract top-level envelope fields
	var envelope struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Explanation string `json:"explanation"`
	}
	// Safe to ignore error — we just want whatever string fields are present
	_ = json.Unmarshal([]byte(jsonStr), &envelope)
	if envelope.Explanation == "" {
		envelope.Explanation = explanation
	}

	// Get the raw config JSON — either from "config" key or the whole object as fallback
	var configRawJSON []byte
	if raw, ok := rawEnvelope["config"]; ok {
		configRawJSON = raw
	} else {
		// Fallback: treat the whole JSON as config (no envelope)
		configRawJSON = []byte(jsonStr)
	}

	// Merge AI config onto defaults using raw JSON map merge
	defaultConfig := store.GetDefaultStrategyConfig(lang)
	mergedConfig, err := mergeStrategyConfigFromRawJSON(defaultConfig, configRawJSON)
	if err != nil {
		logger.Warnf("Strategy generate: merge failed: %v\nJSON: %s", err, string(configRawJSON))
		c.JSON(http.StatusUnprocessableEntity, gin.H{
			"error":       "AI response could not be merged. Please try again.",
			"ai_response": response,
		})
		return
	}

	// Force immutable fields
	mergedConfig.Indicators.EnableRawKlines = true
	mergedConfig.Indicators.NofxOSAPIKey = defaultConfig.Indicators.NofxOSAPIKey

	// Collect warnings before clamping (ClampLimits mutates in-place)
	var warnings []string
	if mergedConfig.RiskControl.MaxPositions > store.MaxPositions {
		warnings = append(warnings, fmt.Sprintf("max_positions clamped to %d", store.MaxPositions))
	}
	if mergedConfig.CoinSource.AI500Limit > store.MaxCandidateCoins {
		warnings = append(warnings, fmt.Sprintf("ai500_limit clamped to %d", store.MaxCandidateCoins))
	}

	// Clamp limits
	mergedConfig.ClampLimits()

	aiExplanation := envelope.Explanation

	// Default name/description if AI didn't provide
	name := envelope.Name
	if name == "" {
		if lang == "zh" {
			name = "AI 生成策略"
		} else {
			name = "AI Generated Strategy"
		}
	}
	description := envelope.Description
	if description == "" {
		if len(req.Description) > 100 {
			description = req.Description[:100] + "..."
		} else {
			description = req.Description
		}
	}

	c.JSON(http.StatusOK, GenerateStrategyResponse{
		Config:        mergedConfig,
		Name:          name,
		Description:   description,
		AIExplanation: aiExplanation,
		Warnings:      warnings,
	})
}

// extractStrategyJSON extracts JSON from AI response and any explanation text
func extractStrategyJSON(response string) (jsonStr string, explanation string) {
	// Clean invisible characters and smart quotes
	s := removeInvisibleRunesStrategy(response)
	s = strings.ReplaceAll(s, "\u201c", "\"")
	s = strings.ReplaceAll(s, "\u201d", "\"")
	s = strings.TrimSpace(s)

	// Try ```json ... ``` fence first
	reJSONFence := regexp.MustCompile("(?s)```json\\s*([\\s\\S]*?)```")
	if m := reJSONFence.FindStringSubmatch(s); m != nil && len(m) > 1 {
		jsonContent := strings.TrimSpace(m[1])
		// Extract explanation from text before the JSON fence
		idx := strings.Index(s, "```json")
		if idx > 0 {
			explanation = strings.TrimSpace(s[:idx])
		}
		return jsonContent, explanation
	}

	// Try ``` ... ``` fence (without json tag)
	reFence := regexp.MustCompile("(?s)```\\s*([\\s\\S]*?)```")
	if m := reFence.FindStringSubmatch(s); m != nil && len(m) > 1 {
		content := strings.TrimSpace(m[1])
		if strings.HasPrefix(content, "{") {
			idx := strings.Index(s, "```")
			if idx > 0 {
				explanation = strings.TrimSpace(s[:idx])
			}
			return content, explanation
		}
	}

	// Fallback: find outermost { ... }
	start := strings.Index(s, "{")
	if start >= 0 {
		depth := 0
		end := -1
		for i := start; i < len(s); i++ {
			switch s[i] {
			case '{':
				depth++
			case '}':
				depth--
				if depth == 0 {
					end = i + 1
					break
				}
			}
			if end >= 0 {
				break
			}
		}
		if end > start {
			if start > 0 {
				explanation = strings.TrimSpace(s[:start])
			}
			return s[start:end], explanation
		}
	}

	return "", ""
}

// removeInvisibleRunesStrategy removes invisible unicode characters
func removeInvisibleRunesStrategy(s string) string {
	return strings.Map(func(r rune) rune {
		if r == '\n' || r == '\r' || r == '\t' || r == ' ' {
			return r
		}
		if unicode.IsControl(r) || !unicode.IsPrint(r) {
			return -1
		}
		return r
	}, s)
}

// mergeStrategyConfigFromRawJSON merges only the keys present in aiConfigJSON onto defaultCfg.
// This avoids the zero-value problem: if AI omits a field, the default is preserved.
func mergeStrategyConfigFromRawJSON(defaultCfg store.StrategyConfig, aiConfigJSON []byte) (store.StrategyConfig, error) {
	// Step 1: Marshal default config to a map
	defaultJSON, err := json.Marshal(defaultCfg)
	if err != nil {
		return defaultCfg, fmt.Errorf("marshal default config: %w", err)
	}
	var defaultMap map[string]interface{}
	if err := json.Unmarshal(defaultJSON, &defaultMap); err != nil {
		return defaultCfg, fmt.Errorf("unmarshal default map: %w", err)
	}

	// Step 2: Parse AI config to a map (only contains keys AI actually returned)
	var aiMap map[string]interface{}
	if err := json.Unmarshal(aiConfigJSON, &aiMap); err != nil {
		return defaultCfg, fmt.Errorf("unmarshal AI config: %w", err)
	}

	// Step 3: Deep merge — only override keys that exist in aiMap
	deepMerge(defaultMap, aiMap)

	// Step 4: Marshal merged map back to JSON, then unmarshal into StrategyConfig
	mergedJSON, err := json.Marshal(defaultMap)
	if err != nil {
		return defaultCfg, fmt.Errorf("marshal merged: %w", err)
	}
	var result store.StrategyConfig
	if err := json.Unmarshal(mergedJSON, &result); err != nil {
		return defaultCfg, fmt.Errorf("unmarshal merged config: %w", err)
	}

	return result, nil
}

// deepMerge recursively merges src into dst. Only keys present in src are written.
// For nested objects, merge is recursive. For all other types, src value replaces dst.
func deepMerge(dst, src map[string]interface{}) {
	for key, srcVal := range src {
		dstVal, exists := dst[key]
		if !exists {
			// New key from AI, add it
			dst[key] = srcVal
			continue
		}

		// If both are maps, recurse
		srcMap, srcIsMap := srcVal.(map[string]interface{})
		dstMap, dstIsMap := dstVal.(map[string]interface{})
		if srcIsMap && dstIsMap {
			deepMerge(dstMap, srcMap)
			continue
		}

		// Otherwise, AI value overrides default
		dst[key] = srcVal
	}
}

// buildStrategyGenerateSystemPrompt builds the system prompt for strategy generation
func buildStrategyGenerateSystemPrompt(lang string) string {
	if lang == "zh" {
		return strategyGenerateSystemPromptZH
	}
	return strategyGenerateSystemPromptEN
}

const strategyGenerateSystemPromptEN = `You are a professional cryptocurrency trading strategy designer. Your task is to convert a user's natural language description into a structured StrategyConfig JSON.

## Instructions

1. **Determine strategy_type** based on the user's description:
   - If the user mentions "grid", "range-bound", "oscillation arbitrage", "grid trading" → strategy_type: "grid_trading"
   - Otherwise → strategy_type: "ai_trading" (default)

2. **Output strict JSON** wrapped in a ` + "```json```" + ` code block with these top-level fields:
   - "name": A short strategy name (3-8 words)
   - "description": A one-sentence description
   - "explanation": Your interpretation of the user's intent and how the config reflects it
   - "config": The StrategyConfig object (only include fields you want to set; unset fields will be filled with defaults)

3. **Only output fields the user's description implies.** Omit fields you're unsure about — defaults will be applied.

4. **Generate customized prompt_sections** that reflect the user's trading style. These are AI behavior instructions:
   - role_definition: Define the trading AI's personality matching the user's style
   - trading_frequency: Set frequency expectations matching the strategy
   - entry_standards: Define entry criteria matching the approach
   - decision_process: Outline the decision flow

## AI Trading Config Schema (strategy_type: "ai_trading")

` + "```" + `
config: {
  strategy_type: "ai_trading",
  language: "en" | "zh",
  coin_source: {
    source_type: "ai500" | "static" | "oi_top" | "oi_low" | "mixed",
    static_coins: ["BTCUSDT", "ETHUSDT"],  // only when source_type="static"
    use_ai500: true/false,
    ai500_limit: 3-10,
    use_oi_top: true/false,
    oi_top_limit: 3-10,
    use_oi_low: true/false,
    oi_low_limit: 3-10
  },
  indicators: {
    klines: {
      primary_timeframe: "1m"|"3m"|"5m"|"15m"|"1h"|"4h",
      primary_count: 10-30,
      enable_multi_timeframe: true/false,
      selected_timeframes: ["5m","15m","1h"]  // max 4
    },
    enable_ema: true/false,
    enable_macd: true/false,
    enable_rsi: true/false,
    enable_atr: true/false,
    enable_boll: true/false,
    enable_volume: true/false,
    enable_oi: true/false,
    enable_funding_rate: true/false,
    enable_quant_data: true/false,
    enable_oi_ranking: true/false,
    enable_price_ranking: true/false
  },
  risk_control: {
    max_positions: 1-3,
    btc_eth_max_leverage: 1-10,
    altcoin_max_leverage: 1-10,
    btc_eth_max_position_value_ratio: 0.5-5.0,
    altcoin_max_position_value_ratio: 0.5-2.0,
    max_margin_usage: 0.3-0.9,
    min_risk_reward_ratio: 1.5-5.0,
    min_confidence: 60-95
  },
  prompt_sections: {
    role_definition: "...",
    trading_frequency: "...",
    entry_standards: "...",
    decision_process: "..."
  },
  custom_prompt: "optional extra instructions"
}
` + "```" + `

## Grid Trading Config Schema (strategy_type: "grid_trading")

` + "```" + `
config: {
  strategy_type: "grid_trading",
  grid_config: {
    symbol: "BTCUSDT",
    grid_count: 5-50,
    total_investment: amount in USDT,
    leverage: 1-20,
    upper_price: 0 (auto) or specific price,
    lower_price: 0 (auto) or specific price,
    use_atr_bounds: true/false,
    atr_multiplier: 1.0-3.0,
    distribution: "uniform" | "gaussian" | "pyramid",
    max_drawdown_pct: 5-30,
    stop_loss_pct: 1-10,
    daily_loss_limit_pct: 3-20,
    enable_direction_adjust: true/false
  }
}
` + "```" + `

## Common Strategy Patterns

- **Trend Following**: longer timeframes (1h/4h), EMA+MACD, higher confidence (80+), fewer positions
- **Scalping**: short timeframes (1m/5m), volume+OI, lower confidence OK, tight stops
- **Conservative**: BTC/ETH only, low leverage (2-3x), high confidence (85+), strict risk/reward (3:1+)
- **Aggressive**: altcoins, higher leverage, more positions, lower confidence threshold
- **Mean Reversion**: RSI+Bollinger, shorter timeframes, moderate leverage

## Important

- Write prompt_sections in English (the language of this prompt)
- Be practical and realistic — don't over-optimize
- If the user specifies a max loss percentage, map it to appropriate risk_control values`

const strategyGenerateSystemPromptZH = `你是一个专业的加密货币交易策略设计师。你的任务是将用户的自然语言描述转换为结构化的 StrategyConfig JSON。

## 指令

1. **判断策略类型** strategy_type：
   - 用户提到"网格"、"grid"、"区间震荡"、"震荡套利" → strategy_type: "grid_trading"
   - 其他情况 → strategy_type: "ai_trading"（默认）

2. **输出严格 JSON**，用 ` + "```json```" + ` 代码块包裹，包含以下顶层字段：
   - "name": 简短的策略名称（3-8 个字）
   - "description": 一句话策略描述
   - "explanation": 你对用户意图的解读，以及配置如何反映用户需求
   - "config": StrategyConfig 对象（只包含你需要设置的字段，未设置的字段会用默认值补全）

3. **只输出用户描述中暗示的字段**。不确定的字段请省略——系统会使用默认值。

4. **生成定制化的 prompt_sections**，反映用户的交易风格。这些是 AI 行为指令：
   - role_definition: 定义匹配用户风格的交易 AI 角色
   - trading_frequency: 设置匹配策略的交易频率预期
   - entry_standards: 定义匹配方法的入场标准
   - decision_process: 概述决策流程

## AI 交易配置 Schema（strategy_type: "ai_trading"）

` + "```" + `
config: {
  strategy_type: "ai_trading",
  language: "en" | "zh",
  coin_source: {
    source_type: "ai500" | "static" | "oi_top" | "oi_low" | "mixed",
    static_coins: ["BTCUSDT", "ETHUSDT"],  // 仅当 source_type="static" 时
    use_ai500: true/false,
    ai500_limit: 3-10,
    use_oi_top: true/false,
    oi_top_limit: 3-10,
    use_oi_low: true/false,
    oi_low_limit: 3-10
  },
  indicators: {
    klines: {
      primary_timeframe: "1m"|"3m"|"5m"|"15m"|"1h"|"4h",
      primary_count: 10-30,
      enable_multi_timeframe: true/false,
      selected_timeframes: ["5m","15m","1h"]  // 最多 4 个
    },
    enable_ema: true/false,
    enable_macd: true/false,
    enable_rsi: true/false,
    enable_atr: true/false,
    enable_boll: true/false,
    enable_volume: true/false,
    enable_oi: true/false,
    enable_funding_rate: true/false,
    enable_quant_data: true/false,
    enable_oi_ranking: true/false,
    enable_price_ranking: true/false
  },
  risk_control: {
    max_positions: 1-3,
    btc_eth_max_leverage: 1-10,
    altcoin_max_leverage: 1-10,
    btc_eth_max_position_value_ratio: 0.5-5.0,
    altcoin_max_position_value_ratio: 0.5-2.0,
    max_margin_usage: 0.3-0.9,
    min_risk_reward_ratio: 1.5-5.0,
    min_confidence: 60-95
  },
  prompt_sections: {
    role_definition: "...",
    trading_frequency: "...",
    entry_standards: "...",
    decision_process: "..."
  },
  custom_prompt: "可选的额外指令"
}
` + "```" + `

## 网格交易配置 Schema（strategy_type: "grid_trading"）

` + "```" + `
config: {
  strategy_type: "grid_trading",
  grid_config: {
    symbol: "BTCUSDT",
    grid_count: 5-50,
    total_investment: USDT 金额,
    leverage: 1-20,
    upper_price: 0（自动）或指定价格,
    lower_price: 0（自动）或指定价格,
    use_atr_bounds: true/false,
    atr_multiplier: 1.0-3.0,
    distribution: "uniform" | "gaussian" | "pyramid",
    max_drawdown_pct: 5-30,
    stop_loss_pct: 1-10,
    daily_loss_limit_pct: 3-20,
    enable_direction_adjust: true/false
  }
}
` + "```" + `

## 常见策略模式参考

- **趋势跟踪**: 较长时间框架（1h/4h），EMA+MACD，高置信度（80+），较少持仓
- **短线剥头皮**: 短时间框架（1m/5m），成交量+OI，置信度要求较低，紧止损
- **保守型**: 只做 BTC/ETH，低杠杆（2-3x），高置信度（85+），严格风险收益比（3:1+）
- **激进型**: 山寨币，较高杠杆，更多持仓，较低置信度阈值
- **均值回归**: RSI+布林带，较短时间框架，适中杠杆

## 重要

- prompt_sections 请用中文撰写
- 务实和现实——不要过度优化
- 如果用户指定了最大亏损百分比，将其映射到合适的 risk_control 参数`
