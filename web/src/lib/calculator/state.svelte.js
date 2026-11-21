// @ts-check
// Calculator state (Svelte 5 runes). Inputs persist in sessionStorage
// ("forgeline.calculator", quantities as cSCU) so a reload or a trip to the
// form keeps them. Quantities are typed in the shared unit (prefs).
import { baselineFor, blendParams, ownSamplesFromOrders, samplesForLoad } from "@forgeline/shared";
import { gameData } from "../stores/gameData.svelte.js";
import { ordersState } from "../stores/orders.svelte.js";
import { prefs } from "../stores/prefs.svelte.js";
import { convertText } from "../quantity.js";
import { toggleMaterialLine } from "../pickers.js";
import {
  MAX_CALC_LINES,
  allLowConfidence,
  computeEstimate,
  dataSource,
  effectiveSelection,
  emptyLine,
  parseLines,
  restoreInputs,
  serializeInputs,
  sortMethods,
} from "./logic.js";

export const STORAGE_KEY = "forgeline.calculator";

/** @typedef {import("./logic.js").CalcLine} CalcLine */
/** @typedef {import("./logic.js").SortBy} SortBy */
/** @typedef {import("../quantity.js").QuantityUnit} QuantityUnit */

/** @returns {unknown} */
function readStored() {
  try {
    const text = sessionStorage.getItem(STORAGE_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

class CalculatorState {
  stationId = $state("");
  /** @type {CalcLine[]} */
  lines = $state([]);
  /** @type {SortBy} */
  sortBy = $state("net");
  /** @type {string | null} */
  selectedMethodId = $state(null);
  /** Unit the line texts are typed in (follows prefs.quantityUnit). */
  /** @type {QuantityUnit} */
  unit = $state("cscu");
  /** True once stored inputs were checked against static data. */
  restored = $state(false);
  #nextKey = 1;

  parsed = $derived(parseLines(this.lines, this.unit));
  allOwnSamples = $derived(ownSamplesFromOrders(ordersState.orders, gameData.staticData));
  /** Own samples of the load's material kind only; a mixed load uses none. */
  load = $derived(samplesForLoad(this.allOwnSamples, this.lines.map((l) => l.materialId), gameData.staticData));
  ownCount = $derived(this.load.samples.filter((s) => s.patch === gameData.staticData?.patch).length);
  params = $derived(
    gameData.staticData
      ? blendParams({
          baseline: baselineFor(gameData.staticData.methods.map((m) => m.id)),
          aggregates: gameData.aggregates,
          ownSamples: this.load.samples,
          patch: gameData.staticData.patch ?? "",
        })
      : null,
  );
  computed = $derived(
    computeEstimate({
      stationId: this.stationId,
      parsed: this.parsed,
      staticData: gameData.staticData,
      prices: gameData.prices,
      params: this.params,
    }),
  );
  result = $derived(this.computed.result);
  reason = $derived(this.computed.reason);
  rows = $derived(this.result ? sortMethods(this.result, this.sortBy) : []);
  selected = $derived(effectiveSelection(this.result, this.selectedMethodId));
  source = $derived(dataSource(this.params, this.ownCount));
  provisional = $derived(allLowConfidence(this.params));
  totalRawCScu = $derived(this.parsed.reduce((sum, l) => sum + (l.cScu ?? 0), 0));

  /** Material picker: add a line, or remove it when selected again. @param {string} materialId */
  toggleMaterial(materialId) {
    this.lines = toggleMaterialLine($state.snapshot(this.lines), materialId, (id) => emptyLine(this.#nextKey++, id), MAX_CALC_LINES);
  }

  /** @param {number} key */
  removeLine(key) {
    this.lines = this.lines.filter((l) => l.key !== key);
  }

  clear() {
    this.stationId = "";
    this.lines = [];
    this.selectedMethodId = null;
  }

  /** Re-expresses typed quantities when the shared unit changes. @param {QuantityUnit} unit */
  setUnit(unit) {
    if (unit === this.unit) return;
    const from = this.unit;
    this.lines = this.lines.map((l) => ({ ...l, qtyText: convertText(l.qtyText, from, unit) }));
    this.unit = unit;
  }

  /** Restores sessionStorage inputs once static data and prefs are known. */
  restore() {
    if (this.restored || !gameData.staticData || !prefs.loaded) return;
    this.unit = prefs.quantityUnit;
    const inputs = restoreInputs(readStored(), gameData.staticData, this.unit);
    this.stationId = inputs.stationId;
    this.lines = inputs.lines;
    this.sortBy = inputs.sortBy;
    this.selectedMethodId = inputs.selectedMethodId;
    this.#nextKey = Math.max(0, ...inputs.lines.map((l) => l.key)) + 1;
    this.restored = true;
  }

  save() {
    try {
      const inputs = { stationId: this.stationId, lines: this.lines, sortBy: this.sortBy, selectedMethodId: this.selectedMethodId };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializeInputs(inputs, this.unit)));
    } catch {
      // storage blocked or full: inputs just aren't kept
    }
  }
}

export const calc = new CalculatorState();
