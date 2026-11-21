<script>
  import { tick, untrack } from "svelte";
  import { endsAt, formatAuec, formatCountdown, formatDuration, formatEndTime, formatScu, parseDuration } from "@forgeline/shared";
  import { bonusFor } from "../lib/calculator/logic.js";
  import { bonusLabel, materialKindOf, methodOptions, stationOptions, toggleMaterialLine } from "../lib/pickers.js";
  import Combobox from "./pickers/Combobox.svelte";
  import RecentStations from "./pickers/RecentStations.svelte";
  import MaterialPicker from "./pickers/MaterialPicker.svelte";
  import { prefs, pushRecentStation, setLastMaterialKind } from "../lib/stores/prefs.svelte.js";
  import UnitToggle from "./pickers/UnitToggle.svelte";
  import {
    MAX_FORM_LINES,
    buildOrderInput,
    convertLines,
    emptyFormLine,
    emptyValues,
    fieldId,
    orderedErrorKeys,
    valuesForEdit,
    valuesFromDraft,
  } from "../lib/orders/form.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { editOrder, ordersState, saveOrder } from "../lib/stores/orders.svelte.js";
  import { clearDraft } from "../lib/stores/draft.svelte.js";
  import { showToast } from "../lib/stores/toast.svelte.js";
  import { updateSettings } from "../lib/storage/settings.js";

  /**
   * @typedef {import("../lib/orders/form.js").FormValues} FormValues
   * @typedef {import("../lib/orders/form.js").FormSettings} FormSettings
   * @typedef {import("../lib/storage/model.js").Order} Order
   * @typedef {import("../lib/stores/draft.svelte.js").OrderDraft} OrderDraft
   */

  /** @type {{ settings: FormSettings, order?: Order | null, draft?: OrderDraft | null, fromEstimate?: boolean }} */
  let { settings, order = null, draft = null, fromEstimate = false } = $props();

  // Props are read once (untracked): the form keeps its own copy while the
  // user types. The parent re-creates the form when the route changes.
  const init = untrack(() => {
    const base = { editing: order, savedDraft: draft, draftLost: fromEstimate && !draft && !order };
    if (order) return { ...base, mode: /** @type {const} */ ("edit"), values: valuesForEdit(order, settings.quantityUnit, Date.now()) };
    if (fromEstimate && draft) return { ...base, mode: /** @type {const} */ ("estimate"), values: valuesFromDraft(draft, settings, gameData.staticData) };
    return { ...base, mode: /** @type {const} */ ("manual"), values: emptyValues(settings, gameData.staticData) };
  });
  const { editing, savedDraft, draftLost } = init;

  /** @type {"manual" | "estimate" | "edit"} */
  let mode = $state(init.mode);
  /** @type {FormValues} */
  let values = $state(init.values);
  let nextKey = init.values.lines.length + 1;
  let changeTime = $state(false);
  let showMore = $state(init.values.capacityText !== "" || init.values.lines.some((l) => l.qualityText !== ""));
  let submitted = $state(false);
  let busy = $state(false);
  /** @type {string | null} */
  let formError = $state(null);
  /** @type {Set<string>} */
  let touched = $state(new Set());

  const stationOpts = $derived(stationOptions(gameData.staticData?.stations));
  const methodOpts = $derived(methodOptions(gameData.staticData?.methods));
  // two columns from 1300 px (wording of the empty-lines hint only)
  let innerWidth = $state(typeof window === "undefined" ? 1280 : window.innerWidth);
  const wide = $derived(innerWidth >= 1300);
  const ctx = $derived({
    mode,
    staticData: gameData.staticData,
    draft: savedDraft,
    changeTime,
    materialName: (/** @type {string} */ id) => gameData.materialName(id),
    stationShort: (/** @type {string} */ id) => gameData.stationShort(id),
  });
  const check = $derived(buildOrderInput(values, ctx));
  const errors = $derived(
    submitted ? check.errors : Object.fromEntries(Object.entries(check.errors).filter(([k]) => touched.has(k))),
  );
  const timeEditable = $derived(mode !== "edit" || changeTime);
  const preview = $derived.by(() => {
    const now = ordersState.nowMs;
    if (!timeEditable && editing) return { at: editing.endsAt, now };
    try {
      return { at: endsAt(now, parseDuration(values.timeText)), now };
    } catch {
      return null;
    }
  });
  const unitLabel = $derived(values.unit === "cscu" ? "cSCU" : "SCU");

  /** @param {string} key */
  function touch(key) {
    if (!touched.has(key)) touched = new Set([...touched, key]);
  }

  /** @param {"manual" | "estimate"} next */
  function switchMode(next) {
    if (next === mode || mode === "edit") return;
    if (next === "estimate" && !savedDraft) return;
    mode = next;
    values = next === "estimate" && savedDraft ? valuesFromDraft(savedDraft, { ...settings, quantityUnit: values.unit }, gameData.staticData) : emptyValues({ ...settings, quantityUnit: values.unit }, gameData.staticData);
    nextKey = values.lines.length + 1;
    submitted = false;
    touched = new Set();
  }

  /** Unit toggle (shared setting): convert what was typed. @param {"cscu" | "scu"} from @param {"cscu" | "scu"} to */
  function onUnitChange(from, to) {
    values.lines = convertLines($state.snapshot(values.lines), from, to);
    values.unit = to;
  }

  /** Material picker: selecting adds a line, unselecting removes it. @param {string} materialId */
  function toggleLine(materialId) {
    values.lines = toggleMaterialLine(
      $state.snapshot(values.lines),
      materialId,
      (id) => ({ ...emptyFormLine(nextKey++), materialId: id }),
      MAX_FORM_LINES,
    );
    touch("materials");
  }

  /** @param {number} key */
  function removeLine(key) {
    values.lines = values.lines.filter((l) => l.key !== key);
  }

  async function startChangeTime() {
    changeTime = true;
    values.timeText = "";
    await tick();
    document.getElementById("f-time")?.focus();
  }

  /** @param {SubmitEvent} event */
  async function submit(event) {
    event.preventDefault();
    submitted = true;
    formError = null;
    const result = check;
    if (!result.ok) {
      await tick();
      const first = orderedErrorKeys(result.errors, values.lines.length)[0];
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    busy = true;
    try {
      const staticData = gameData.staticData;
      if (mode === "edit" && editing && result.changes) {
        await editOrder(editing.id, result.changes, { staticData });
        showToast("Order updated");
      } else if (result.input) {
        const saved = await saveOrder(result.input, { staticData });
        showToast(`Order saved · ready ${formatEndTime(saved.endsAt, Date.now())}`);
        if (mode === "estimate") clearDraft();
      }
      await updateSettings({ lastStationId: values.stationId, lastMethodId: values.methodId }).catch(() => {});
      pushRecentStation(values.stationId);
      setLastMaterialKind(materialKindOf(values.lines.map((l) => l.materialId), gameData.staticData?.materials));
      location.hash = "#/orders";
    } catch (err) {
      formError = err instanceof Error ? err.message : "The order could not be saved.";
    } finally {
      busy = false;
    }
  }

  function cancel() {
    if (history.length > 1) history.back();
    else location.hash = "#/orders";
  }

  /** @param {string} key */
  const err = (key) => errors[key];
  /** @param {string} key */
  const described = (key) => (errors[key] ? `${fieldId(key)}-error` : undefined);
</script>

<svelte:window bind:innerWidth />

<form novalidate onsubmit={submit} class="order-form">
  <!-- LEFT: how / where / which method / which materials -->
  <div class="col">
    {#if mode !== "edit"}
      <div class="modes" role="group" aria-label="How did you start this order?">
        <button type="button" class="mode" aria-pressed={mode === "manual"} onclick={() => switchMode("manual")}>Started in game</button>
        <button
          type="button"
          class="mode"
          aria-pressed={mode === "estimate"}
          disabled={!savedDraft}
          title={savedDraft ? undefined : "Use “Save as order” in the calculator first"}
          onclick={() => switchMode("estimate")}>From estimate</button
        >
      </div>
    {/if}

    {#if draftLost}
      <p class="notice" role="status">
        The estimate was lost when the page reloaded. <a href="#/calculator">Go back to the calculator</a> or fill in the form.
      </p>
    {/if}

    {#if mode === "estimate" && savedDraft}
      <aside class="estimate" aria-label="Estimate">
        <span class="estimate-title">Estimate · {gameData.methodName(savedDraft.snapshot.methodId)}</span>
        <span>Yield <span class="num">{formatScu(savedDraft.snapshot.totalRefinedCScu)}</span></span>
        <span>Cost <span class="num">{formatAuec(savedDraft.snapshot.costAuec)}</span></span>
        <span>Time <span class="num">{formatDuration(savedDraft.snapshot.durationSec)}</span></span>
      </aside>
    {/if}

    <div class="station-row">
      <Combobox
        bind:value={values.stationId}
        options={stationOpts}
        id="f-station"
        label="Station"
        placeholder="Type a station, e.g. MIC-L2"
        picker="station"
        error={err("stationId")}
        onblur={() => touch("stationId")}
      />
      <RecentStations stations={gameData.staticData?.stations} value={values.stationId} onpick={(id) => (values.stationId = id)} />
    </div>

    <Combobox
      bind:value={values.methodId}
      options={methodOpts}
      id="f-method"
      label="Method"
      placeholder="Type a method, e.g. Dinyx"
      picker="method"
      error={err("methodId")}
      onblur={() => touch("methodId")}
    />

    <MaterialPicker
      selected={values.lines.map((l) => l.materialId)}
      ontoggle={toggleLine}
      materials={gameData.staticData?.materials}
      bonuses={gameData.staticData?.bonuses}
      stationId={values.stationId}
      max={MAX_FORM_LINES}
      defaultKind={prefs.lastMaterialKind}
      id="f-materials"
      error={err("materials")}
    />
  </div>

  <!-- RIGHT: what the terminal shows -->
  <div class="col">
    <div class="lines">
      <div class="lines-head">
        <span class="lines-title">Quantities</span>
        <UnitToggle compact onchange={onUnitChange} />
      </div>
      {#if values.lines.length === 0}
        <p class="hint empty-lines">Pick the materials on the {wide ? "left" : "list above"}; a line for each appears here.</p>
      {:else}
        <p class="hint">Copy QTY and the YIELD column from the terminal.</p>
      {/if}

      {#each values.lines as line, i (line.key)}
        {@const lineErrors = ["material", "qty", "yield", "quality"].map((f) => err(`materials.${i}.${f}`)).filter(Boolean)}
        {@const bonus = bonusLabel(bonusFor(gameData.staticData, values.stationId, line.materialId))}
        {@const name = gameData.materialName(line.materialId)}
        <div class="line" class:more={showMore}>
          <div class="line-name">
            <span class="material-name">{name}</span>
            {#if bonus}<span class="bonus-tag {bonus.tone}">{bonus.text} yield here</span>{/if}
          </div>
          <div class="field qty">
            <label for="f-qty-{i}">Qty <span class="unit-tag">{unitLabel}</span></label>
            <input
              id="f-qty-{i}"
              type="text"
              inputmode={values.unit === "cscu" ? "numeric" : "decimal"}
              autocomplete="off"
              placeholder={values.unit === "cscu" ? "43200" : "432"}
              bind:value={line.qtyText}
              onblur={() => touch(`materials.${i}.qty`)}
              aria-invalid={err(`materials.${i}.qty`) || err(`materials.${i}.material`) ? "true" : undefined}
              aria-describedby={lineErrors.length ? `f-line-${i}-error` : undefined}
            />
          </div>
          <div class="field yield">
            <label for="f-yield-{i}">Yield <span class="unit-tag">{unitLabel}</span></label>
            <input
              id="f-yield-{i}"
              type="text"
              inputmode={values.unit === "cscu" ? "numeric" : "decimal"}
              autocomplete="off"
              placeholder="optional"
              bind:value={line.yieldText}
              onblur={() => touch(`materials.${i}.yield`)}
              aria-invalid={err(`materials.${i}.yield`) ? "true" : undefined}
              aria-describedby={lineErrors.length ? `f-line-${i}-error` : undefined}
            />
          </div>
          {#if showMore}
            <div class="field quality">
              <label for="f-quality-{i}">Quality</label>
              <input
                id="f-quality-{i}"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="0"
                bind:value={line.qualityText}
                onblur={() => touch(`materials.${i}.quality`)}
                aria-invalid={err(`materials.${i}.quality`) ? "true" : undefined}
              />
            </div>
          {/if}
          <button type="button" class="remove" aria-label="Remove {name}" onclick={() => removeLine(line.key)}>×</button>
          {#if lineErrors.length}
            <p class="error line-error" id="f-line-{i}-error">{lineErrors.join(" ")}</p>
          {/if}
        </div>
      {/each}
    </div>

    <div class="row two">
      <div class="field">
        <label for="f-cost">Total cost <span class="unit-tag">aUEC</span> <span class="optional">optional</span></label>
        <input
          id="f-cost"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          placeholder="3455.00"
          bind:value={values.costText}
          onblur={() => touch("costAuec")}
          aria-invalid={err("costAuec") ? "true" : undefined}
          aria-describedby={described("costAuec")}
        />
        {#if err("costAuec")}<p class="error" id="f-cost-error">{err("costAuec")}</p>{/if}
      </div>

      <div class="field">
        <label for="f-time">Time left</label>
        <div class="time-row">
          <input
            id="f-time"
            type="text"
            autocomplete="off"
            placeholder="43h 12m"
            readonly={!timeEditable}
            bind:value={values.timeText}
            onblur={() => touch("durationSec")}
            aria-invalid={err("durationSec") ? "true" : undefined}
            aria-describedby={err("durationSec") ? "f-time-error" : "f-time-help"}
          />
          {#if !timeEditable}
            <button type="button" class="btn" onclick={startChangeTime}>Change time</button>
          {/if}
        </div>
        {#if err("durationSec")}
          <p class="error" id="f-time-error">{err("durationSec")}</p>
        {/if}
      </div>
    </div>
    <p class="hint" id="f-time-help">
      {#if timeEditable}
        Time left: the terminal's PROCESSING TIME for a new order, or the time left in the work order list.
      {:else}
        Current time left. Keep it to leave the end time unchanged.
      {/if}
    </p>
    {#if preview}
      <p class="preview">
        <span class="label">Ready at</span>
        <span class="num">{formatEndTime(preview.at, preview.now)}</span>
        <span class="muted">· {formatCountdown(preview.at, preview.now)}</span>
      </p>
    {/if}

    <div class="field">
      <label for="f-title">Title <span class="optional">optional</span></label>
      <input
        id="f-title"
        type="text"
        autocomplete="off"
        maxlength="60"
        placeholder={check.title || "Generated from the first material and station"}
        bind:value={values.title}
        onblur={() => touch("title")}
        aria-invalid={err("title") ? "true" : undefined}
        aria-describedby={described("title")}
      />
      {#if err("title")}<p class="error" id="f-title-error">{err("title")}</p>{/if}
    </div>

    <button type="button" class="more-toggle" aria-expanded={showMore} aria-controls="more-fields" onclick={() => (showMore = !showMore)}>
      {showMore ? "▾" : "▸"} More fields <span class="muted">(capacity, quality)</span>
    </button>
    {#if showMore}
      <div class="field capacity" id="more-fields">
        <label for="f-capacity">Refinery capacity <span class="unit-tag">%</span></label>
        <input
          id="f-capacity"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="336"
          bind:value={values.capacityText}
          onblur={() => touch("capacityPct")}
          aria-invalid={err("capacityPct") ? "true" : undefined}
          aria-describedby={described("capacityPct")}
        />
        {#if err("capacityPct")}<p class="error" id="f-capacity-error">{err("capacityPct")}</p>{:else}<p class="hint">
            The terminal's CURRENT CAPACITY. Quality is per material line above.
          </p>{/if}
      </div>
    {/if}

    {#if formError}<p class="error" role="alert">{formError}</p>{/if}

    <div class="actions">
      <button type="submit" class="btn btn-primary" disabled={busy}>{mode === "edit" ? "Save changes" : "Save order"}</button>
      <button type="button" class="btn" onclick={cancel}>Cancel</button>
    </div>
  </div>
</form>

<style>
  .order-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4) var(--space-6);
    align-items: start;
  }

  /* Two equal columns from 1300 px: where/what on the left, terminal numbers on the right. */
  @media (min-width: 1300px) {
    .order-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .col {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .station-row {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-2) var(--space-3);
  }

  .station-row > :global(.combo) {
    flex: 1 1 240px;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .lines-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .lines-title {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .empty-lines {
    padding: var(--space-3);
    border: 1px dashed var(--color-border);
  }

  .modes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .mode {
    min-height: var(--touch);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-panel);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
  }

  .mode[aria-pressed="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .mode:disabled {
    color: var(--color-muted);
    cursor: not-allowed;
  }

  .notice {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--color-accent);
    background: var(--color-panel);
  }

  .estimate {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-ready);
    background: var(--color-panel);
    font-size: 14px;
  }

  .estimate-title {
    font-weight: 600;
  }

  .row.two {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
  }

  @media (min-width: 640px) {
    .row.two {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  label,
  .label {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .unit-tag,
  .optional {
    margin-left: 4px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: none;
  }

  input[type="text"] {
    min-height: var(--touch);
    width: 100%;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
  }

  input[readonly] {
    color: var(--color-muted);
    border-style: dashed;
  }

  .qty input,
  .yield input,
  .quality input,
  .capacity input,
  #f-cost,
  #f-time {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  [aria-invalid="true"] {
    border-color: #e5484d;
  }

  .error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }

  .hint {
    margin: 0;
    color: var(--color-muted);
    font-size: 14px;
  }

  .materials {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .unit-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border);
  }

  /* One line per selected material: name + bonus, Qty, Yield, (Quality), × */
  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) var(--touch);
    grid-template-areas:
      "name name remove"
      "qty yield yield"
      "error error error";
    gap: var(--space-2);
    padding: var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-panel);
  }

  .line.more {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr) var(--touch);
    grid-template-areas:
      "name name name remove"
      "qty yield quality quality"
      "error error error error";
  }

  @media (min-width: 640px) {
    .line {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) var(--touch);
      grid-template-areas: "name qty yield remove" "error error error error";
      align-items: end;
    }

    .line.more {
      grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.7fr) var(--touch);
      grid-template-areas: "name qty yield quality remove" "error error error error error";
    }
  }

  .line-name {
    grid-area: name;
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: var(--touch);
    min-width: 0;
  }

  .material-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .qty {
    grid-area: qty;
  }
  .yield {
    grid-area: yield;
  }
  .quality {
    grid-area: quality;
  }
  .line-error {
    grid-area: error;
  }

  .remove {
    grid-area: remove;
    align-self: end;
    min-height: var(--touch);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: transparent;
    color: var(--color-muted);
    font-size: 22px;
    cursor: pointer;
  }

  .remove:hover {
    border-color: #e5484d;
    color: #ff8b8e;
  }

  .time-row {
    display: flex;
    gap: var(--space-2);
  }

  .preview {
    margin: var(--space-1) 0 0;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-panel);
  }

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  .more-toggle {
    align-self: flex-start;
    min-height: var(--touch);
    padding: 0;
    border: 0;
    background: none;
    color: var(--color-accent);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: 1px solid var(--color-border);
  }
</style>
