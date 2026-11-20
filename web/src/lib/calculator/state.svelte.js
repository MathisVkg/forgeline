// @ts-check
// Calculator state (Svelte 5 runes). Inputs persist in sessionStorage
// ("forgeline.calculator") so a reload or a trip to the form keeps them.
import { baselineFor, blendParams, ownSamplesFromOrders } from "@forgeline/shared";
import { gameData } from "../stores/gameData.svelte.js";
import { ordersState } from "../stores/orders.svelte.js";
import {
  MAX_CALC_LINES,
  allLowConfidence,
  computeEstimate,
  dataSource,
  effectiveSelection,
  emptyLine,
  parseLines,
  restoreInputs,
  sortMethods,
} from "./logic.js";

export const STORAGE_KEY = "forgeline.calculator";

/** @typedef {import("./logic.js").CalcLine} CalcLine */
/** @typedef {import("./logic.js").SortBy} SortBy */

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
  lines = $state([emptyLine(1)]);
  /** @type {SortBy} */
  sortBy = $state("net");
  /** @type {string | null} */
  selectedMethodId = $state(null);
  /** True once stored inputs were checked against static data. */
  restored = $state(false);
  #nextKey = 2;

  parsed = $derived(parseLines(this.lines));
  ownSamples = $derived(ownSamplesFromOrders(ordersState.orders, gameData.staticData));
  ownCount = $derived(this.ownSamples.filter((s) => s.patch === gameData.staticData?.patch).length);
  params = $derived(
    gameData.staticData
      ? blendParams({
          baseline: baselineFor(gameData.staticData.methods.map((m) => m.id)),
          aggregates: gameData.aggregates,
          ownSamples: this.ownSamples,
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

  addLine() {
    if (this.lines.length >= MAX_CALC_LINES) return;
    this.lines.push(emptyLine(this.#nextKey++));
  }

  /** @param {number} key */
  removeLine(key) {
    this.lines = this.lines.filter((l) => l.key !== key);
    if (this.lines.length === 0) this.lines = [emptyLine(this.#nextKey++)];
  }

  clear() {
    this.stationId = "";
    this.lines = [emptyLine(this.#nextKey++)];
    this.selectedMethodId = null;
  }

  /** Restores sessionStorage inputs once static data is known. */
  restore() {
    if (this.restored || !gameData.staticData) return;
    const inputs = restoreInputs(readStored(), gameData.staticData);
    this.stationId = inputs.stationId;
    this.lines = inputs.lines;
    this.sortBy = inputs.sortBy;
    this.selectedMethodId = inputs.selectedMethodId;
    this.#nextKey = Math.max(0, ...inputs.lines.map((l) => l.key)) + 1;
    this.restored = true;
  }

  save() {
    try {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          stationId: this.stationId,
          lines: this.lines.map((l) => ({ materialId: l.materialId, scuText: l.scuText })),
          sortBy: this.sortBy,
          selectedMethodId: this.selectedMethodId,
        }),
      );
    } catch {
      // storage blocked or full: inputs just aren't kept
    }
  }
}

export const calc = new CalculatorState();
