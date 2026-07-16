import * as fs from "node:fs";
import * as path from "node:path";
import type { StrategyInputDefinitionItem, StrategyInputSet } from "@/lib/monitoring/strategyTester/types";
import { getAgriFinalRegistryAsset, getActiveRegistryPath } from "@/lib/server/monitoring/agriFinalStatus";
import type { AgricultureMvaDataBinding, MvaEngineInputSource } from "./types";

const PROJECT_ROOT = path.join(process.cwd(), "..");

function projectPath(rel: string): string {
  return path.join(PROJECT_ROOT, rel);
}

function parseBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "an" || text === "on" || text === "yes" || text === "ja";
}

function parseNumber(value: unknown): number | null {
  const text = String(value ?? "").replace(",", ".").trim();
  if (!text) return null;
  const num = Number.parseFloat(text);
  return Number.isFinite(num) ? num : null;
}

function fromPayloadType(type: string): StrategyInputDefinitionItem["type"] {
  if (type === "bool") return "boolean";
  if (type === "number") return "number";
  if (type === "select") return "select";
  return "string";
}

function inferTypeFromValue(value: unknown): StrategyInputDefinitionItem["type"] {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

function normalizeValue(type: string, value: unknown): unknown {
  if (type === "bool") return parseBool(value);
  if (type === "number") return parseNumber(value) ?? 0;
  return value == null ? "" : String(value);
}

const ENGINE_DEFAULT_INPUTS: Array<{ key: string; label: string; group: string; type: StrategyInputDefinitionItem["type"]; defaultValue: unknown; options?: string[] }> = [
  { key: "riskPct", label: "Risk %", group: "Risk", type: "number", defaultValue: 1 },
  { key: "useATR", label: "Use ATR", group: "Risk", type: "boolean", defaultValue: true },
  { key: "atrLen", label: "ATR Length", group: "Risk", type: "number", defaultValue: 10 },
  { key: "slATR", label: "SL ATR Mult", group: "Risk", type: "number", defaultValue: 0.8 },
  { key: "rr", label: "Risk Reward", group: "Risk", type: "number", defaultValue: 2 },
  { key: "useBE", label: "Break Even", group: "Risk", type: "boolean", defaultValue: false },
  { key: "beATR", label: "BE Trigger ATR", group: "Risk", type: "number", defaultValue: 1 },
  { key: "useTrail", label: "Trailing", group: "Risk", type: "boolean", defaultValue: false },
  { key: "trailATR", label: "Trail ATR Mult", group: "Risk", type: "number", defaultValue: 1 },
  { key: "minContract", label: "Min Contracts", group: "Position", type: "number", defaultValue: 0.01 },
  { key: "pointvalue", label: "Point Value", group: "Position", type: "number", defaultValue: 15000 },
  { key: "enableLongs", label: "Long aktiv", group: "Execution", type: "boolean", defaultValue: true },
  { key: "enableShorts", label: "Short aktiv", group: "Execution", type: "boolean", defaultValue: true },
  { key: "cooldown", label: "Cooldown", group: "Execution", type: "number", defaultValue: 0 },
  { key: "useCustomBase", label: "Use Custom Base Symbol", group: "Core", type: "boolean", defaultValue: false },
  { key: "baseSymbol", label: "Base Symbol", group: "Core", type: "string", defaultValue: "SP:SPX" },
  { key: "fastLen", label: "Fast", group: "Core", type: "number", defaultValue: 10 },
  { key: "slowLen", label: "Slow", group: "Core", type: "number", defaultValue: 20 },
  { key: "rescale", label: "Rescale", group: "Core", type: "number", defaultValue: 100 },
  { key: "upper", label: "Upper", group: "Core", type: "number", defaultValue: 75 },
  { key: "lower", label: "Lower", group: "Core", type: "number", defaultValue: -75 },
  { key: "valMode", label: "Valuation Mode", group: "Core", type: "select", defaultValue: "Either", options: ["Fast Only", "Slow Only", "Both Confirm", "Either"] },
  { key: "valRequirement", label: "Valuation Requirement", group: "Core", type: "select", defaultValue: "Combined", options: ["Combined", "1 von 3", "2 von 3", "3 von 3"] },
  { key: "exitOppVal", label: "Exit Opposite Valuation", group: "Core", type: "boolean", defaultValue: true },
  { key: "use1", label: "Use 1", group: "Comparison", type: "boolean", defaultValue: true },
  { key: "sym1", label: "Symbol 1", group: "Comparison", type: "string", defaultValue: "TVC:DXY" },
  { key: "use2", label: "Use 2", group: "Comparison", type: "boolean", defaultValue: true },
  { key: "sym2", label: "Symbol 2", group: "Comparison", type: "string", defaultValue: "ICEUS_DLY:SB1!" },
  { key: "use3", label: "Use 3", group: "Comparison", type: "boolean", defaultValue: false },
  { key: "sym3", label: "Symbol 3", group: "Comparison", type: "string", defaultValue: "CBOT:ZB1!" },
  { key: "useTrendEngine", label: "Trend Engine", group: "Advanced", type: "boolean", defaultValue: false },
  { key: "useRegime", label: "Use Regime", group: "Advanced", type: "boolean", defaultValue: false },
  { key: "logicMode", label: "Logic Mode", group: "Advanced", type: "select", defaultValue: "OR", options: ["AND", "OR"] },
  { key: "sd", label: "Supply Demand", group: "Advanced", type: "boolean", defaultValue: false },
  { key: "sd1", label: "Supply Demand Strong", group: "Advanced", type: "boolean", defaultValue: false },
  { key: "useEmaTrendFilter", label: "Use EMA Trend Filter", group: "EMA Trend Filter", type: "boolean", defaultValue: false },
  { key: "emaTrendMode", label: "EMA Trend Mode", group: "EMA Trend Filter", type: "select", defaultValue: "Close vs EMA", options: ["Close vs EMA", "EMA Fast vs EMA Slow", "Close + EMA Fast vs Slow", "EMA Stack", "EMA Slope"] },
  { key: "emaFastLen", label: "EMA Fast Length", group: "EMA Trend Filter", type: "number", defaultValue: 50 },
  { key: "emaMidLen", label: "EMA Mid Length", group: "EMA Trend Filter", type: "number", defaultValue: 100 },
  { key: "emaSlowLen", label: "EMA Slow Length", group: "EMA Trend Filter", type: "number", defaultValue: 200 },
  { key: "emaSlopeBars", label: "EMA Slope Bars", group: "EMA Trend Filter", type: "number", defaultValue: 5 },
  { key: "commissionPct", label: "Commission %", group: "Costs", type: "number", defaultValue: 0.01 },
  { key: "spreadTicks", label: "Spread (Ticks)", group: "Costs", type: "number", defaultValue: 0 },
  { key: "slippageTicks", label: "Slippage (Ticks)", group: "Costs", type: "number", defaultValue: 0 },
  { key: "financingRatePct", label: "Financing Rate % p.a.", group: "Costs", type: "number", defaultValue: 0 },
];

export function toInputValueMap(inputSet: StrategyInputSet, customInputs?: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    inputSet.inputs.map((input) => [
      input.key,
      customInputs && Object.prototype.hasOwnProperty.call(customInputs, input.key)
        ? customInputs[input.key]
        : input.defaultValue,
    ]),
  );
}

export function loadMacroValuationInputs(binding: AgricultureMvaDataBinding): {
  inputSet: StrategyInputSet;
  inputAvailability: "xlsx_params_available" | "missing_input_xlsx";
  inputSource: MvaEngineInputSource;
} {
  const payload = binding.generatedPayloadPath && fs.existsSync(projectPath(binding.generatedPayloadPath))
    ? JSON.parse(fs.readFileSync(projectPath(binding.generatedPayloadPath), "utf8")) as {
        metadata?: { tvSymbol?: string; params?: Array<{ key: string; label?: string; group?: string; type?: string; value?: unknown; options?: string[] }> };
      }
    : null;

  const payloadParams = payload?.metadata?.params ?? [];
  const payloadParamMap = new Map(payloadParams.map((param) => [param.key, param]));
  const engineDefaultsMap = new Map(ENGINE_DEFAULT_INPUTS.map((input) => [input.key, input]));
  const registryAsset = getAgriFinalRegistryAsset(binding.symbol);

  if (registryAsset?.params && Object.keys(registryAsset.params).length) {
    const inputs: StrategyInputDefinitionItem[] = Object.entries(registryAsset.params).map(([key, rawValue]) => {
      const payloadParam = payloadParamMap.get(key);
      const fallback = engineDefaultsMap.get(key);
      const type = payloadParam?.type
        ? fromPayloadType(payloadParam.type)
        : fallback?.type ?? inferTypeFromValue(rawValue);
      const normalizedValue =
        payloadParam?.type != null
          ? normalizeValue(payloadParam.type, rawValue)
          : type === "number"
            ? parseNumber(rawValue) ?? 0
            : type === "boolean"
              ? parseBool(rawValue)
              : rawValue == null
                ? ""
                : String(rawValue);
      return {
        key,
        label: payloadParam?.label ?? fallback?.label ?? key,
        group: payloadParam?.group ?? fallback?.group ?? "Advanced",
        type,
        defaultValue: normalizedValue,
        options: payloadParam?.options ?? fallback?.options,
      };
    });

    return {
      inputSet: {
        strategyKind: "macro_valuation",
        symbol: binding.symbol,
        sourceFile: getActiveRegistryPath(),
        sourceSheet: `assets.${binding.symbol}.params`,
        inputFingerprint: `${path.basename(getActiveRegistryPath(), ".json")}:${binding.symbol}`,
        generatedAt: new Date().toISOString(),
        inputs,
        metadata: {
          tradingViewSymbol: payload?.metadata?.tvSymbol ?? binding.tvSymbol,
          timeframe: "D",
          pointValue: Number(inputs.find((item) => item.key === "pointvalue")?.defaultValue ?? 0) || null,
          currency: "",
          tickSize: "",
          backtestingRange: "",
          tradingRange: "",
        },
      },
      inputAvailability: binding.inputParamsXlsxPath ? "xlsx_params_available" : "missing_input_xlsx",
      inputSource: "generated_monitoring_payload",
    };
  }

  if (payload) {
    const inputs: StrategyInputDefinitionItem[] = payloadParams.map((param) => ({
      key: param.key,
      label: param.label ?? param.key,
      group: param.group ?? "Advanced",
      type: fromPayloadType(param.type ?? "text"),
      defaultValue: normalizeValue(param.type ?? "text", param.value),
      options: param.options ?? undefined,
    }));
    return {
      inputSet: {
        strategyKind: "macro_valuation",
        symbol: binding.symbol,
        sourceFile: binding.generatedPayloadPath ?? "generated_monitoring_payload",
        sourceSheet: "metadata.params",
        inputFingerprint: path.basename(binding.generatedPayloadPath ?? "generated_monitoring_payload.json"),
        generatedAt: new Date().toISOString(),
        inputs,
        metadata: {
          tradingViewSymbol: payload.metadata?.tvSymbol ?? binding.tvSymbol,
          timeframe: "D",
          pointValue: Number(inputs.find((item) => item.key === "pointvalue")?.defaultValue ?? 0) || null,
          currency: "",
          tickSize: "",
          backtestingRange: "",
          tradingRange: "",
        },
      },
      inputAvailability: binding.inputParamsXlsxPath ? "xlsx_params_available" : "missing_input_xlsx",
      inputSource: "generated_monitoring_payload",
    };
  }

  return {
    inputSet: {
      strategyKind: "macro_valuation",
      symbol: binding.symbol,
      sourceFile: "workspace/tools/custom_strategy_engines/strategies/orange_juice_strategy.py",
      sourceSheet: "CONFIG",
      inputFingerprint: `engine_defaults_${binding.symbol}`,
      generatedAt: new Date().toISOString(),
      inputs: ENGINE_DEFAULT_INPUTS.map((input) => ({ ...input })),
      metadata: {
        tradingViewSymbol: binding.tvSymbol,
        timeframe: "D",
        pointValue: 15000,
        currency: "",
        tickSize: "",
        backtestingRange: "",
        tradingRange: "",
      },
    },
    inputAvailability: "missing_input_xlsx",
    inputSource: "engine_defaults",
  };
}
