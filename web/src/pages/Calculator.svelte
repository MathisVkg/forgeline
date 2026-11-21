<script>
  import { untrack } from "svelte";
  import { formatAge, formatAuec, formatDuration, formatScu } from "@forgeline/shared";
  import { calc } from "../lib/calculator/state.svelte.js";
  import { DRAFT_ROUTE, MAX_CALC_LINES, bonusFor, buildDraft, refinedPricesDate } from "../lib/calculator/logic.js";
  import { bonusLabel, stationOptions } from "../lib/pickers.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { ordersState } from "../lib/stores/orders.svelte.js";
  import { prefs, pushRecentStation } from "../lib/stores/prefs.svelte.js";
  import { setDraft } from "../lib/stores/draft.svelte.js";
  import Combobox from "../components/pickers/Combobox.svelte";
  import RecentStations from "../components/pickers/RecentStations.svelte";
  import MaterialPicker from "../components/pickers/MaterialPicker.svelte";
  import UnitToggle from "../components/pickers/UnitToggle.svelte";

  const result = $derived(calc.result);
  const missing = $derived(result?.methods[0]?.missingPrices ?? []);
  const pricesAt = $derived(refinedPricesDate(result, gameData.staticData, gameData.prices));
  const selectedName = $derived(calc.selected ? gameData.methodName(calc.selected) : null);
  const unitLabel = $derived(calc.unit === "cscu" ? "cSCU" : "SCU");
  const stationOpts = $derived(stationOptions(gameData.staticData?.stations));

  // Restore saved inputs once game data and prefs are known, then save on every change.
  $effect(() => {
    if (gameData.staticData && prefs.loaded) calc.restore();
  });
  $effect(() => {
    if (!calc.restored) return;
    void [calc.stationId, calc.sortBy, calc.selectedMethodId, calc.unit, ...calc.lines.map((l) => l.materialId + l.qtyText)];
    calc.save();
  });
  // The unit is shared with the order form: follow it, converting typed text.
  $effect(() => {
    const unit = prefs.quantityUnit;
    if (calc.restored) untrack(() => calc.setUnit(unit));
  });

  /** Recent-station chip. @param {string} id */
  function pickStation(id) {
    calc.stationId = id;
    pushRecentStation(id);
  }

  function saveAsOrder() {
    if (!result || !calc.selected) return;
    setDraft(buildDraft(result, calc.selected, gameData.prices, gameData.staticData?.patch ?? null, Date.now()));
    location.hash = DRAFT_ROUTE;
  }

  /** @param {string} id */
  const materialName = (id) => gameData.materialName(id);
  // Table cells show numbers only; units are in the row under the header.
  /** @param {number} n */
  const auec = (n) => formatAuec(n).replace(/ aUEC$/, "");
  /** @param {number} c */
  const scu = (c) => formatScu(c).replace(/ SCU$/, "");
</script>

<section class="page" aria-labelledby="calc-title">
  <header class="head">
    <p class="eyebrow">Estimate</p>
    <h1 id="calc-title">Refinery calculator</h1>
  </header>

  {#if !gameData.loaded}
    <p class="muted" aria-live="polite">Loading game data…</p>
  {:else if !gameData.staticData}
    <div class="notice" role="alert">
      <p>{gameData.error}</p>
      <p class="muted">The calculator needs stations, materials and prices from the server.</p>
    </div>
  {:else}
    <div class="panels">
      <!-- LEFT: raw load -->
      <section class="panel" aria-labelledby="load-title">
        <div class="panel-head">
          <p class="step">Step 01</p>
          <h2 id="load-title">Raw load</h2>
          <button type="button" class="btn btn-ghost clear" onclick={() => calc.clear()}>Clear</button>
        </div>

        <div class="station-row">
          <Combobox
            bind:value={calc.stationId}
            options={stationOpts}
            id="calc-station"
            label="Station"
            placeholder="Type a station, e.g. MIC-L2"
            picker="station"
            inline
            onchange={(id) => pushRecentStation(id)}
          />
          <RecentStations stations={gameData.staticData.stations} value={calc.stationId} onpick={pickStation} />
        </div>

        <MaterialPicker
          selected={calc.lines.map((l) => l.materialId)}
          ontoggle={(id) => calc.toggleMaterial(id)}
          materials={gameData.staticData.materials}
          bonuses={gameData.staticData.bonuses}
          stationId={calc.stationId}
          max={MAX_CALC_LINES}
          defaultKind={prefs.lastMaterialKind}
          id="calc-materials"
        />

        {#if calc.lines.length}
          <div class="lines">
            <div class="lines-head">
              <span class="lines-title">Raw quantities</span>
              <UnitToggle compact />
            </div>
            {#each calc.lines as line, i (line.key)}
              {@const parsed = calc.parsed[i]}
              {@const bonus = bonusLabel(bonusFor(gameData.staticData, calc.stationId, line.materialId))}
              {@const name = materialName(line.materialId)}
              <div class="line">
                <div class="line-name">
                  <span class="material-name">{name}</span>
                  {#if bonus}
                    <span class="bonus-tag {bonus.tone}" id="bonus-{line.key}">{bonus.text} yield here</span>
                  {/if}
                </div>
                <label class="sr-only" for="qty-{line.key}">Raw quantity of {name} in {unitLabel}</label>
                <div class="qty">
                  <input
                    id="qty-{line.key}"
                    type="text"
                    inputmode={calc.unit === "cscu" ? "numeric" : "decimal"}
                    autocomplete="off"
                    placeholder="0"
                    bind:value={line.qtyText}
                    aria-invalid={parsed?.error ? "true" : undefined}
                    aria-describedby={parsed?.error ? `err-${line.key}` : bonus ? `bonus-${line.key}` : undefined}
                  />
                  <span class="unit" aria-hidden="true">{unitLabel}</span>
                </div>
                <button type="button" class="remove" aria-label="Remove {name}" onclick={() => calc.removeLine(line.key)}>×</button>
                {#if parsed?.error}
                  <p class="field-error" id="err-{line.key}">{parsed.error}</p>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <div class="totals">
          <dl>
            <div>
              <dt>Total raw</dt>
              <dd class="num">{formatScu(calc.totalRawCScu)}</dd>
            </div>
            <div>
              <dt>Sell raw instead</dt>
              <dd>
                {#if result && result.sellRaw.missingPrices.length < result.materials.length}
                  <span class="num">{formatAuec(result.sellRaw.totalAuec)}</span>
                  {#if result.sellRaw.oldestUpdatedAt}
                    <span class="hint">prices from {formatAge(result.sellRaw.oldestUpdatedAt, ordersState.nowMs)}</span>
                  {/if}
                  {#if result.sellRaw.missingPrices.length}
                    <span class="hint warn">
                      {result.sellRaw.missingPrices.length} material{result.sellRaw.missingPrices.length === 1 ? " has" : "s have"} no raw price
                    </span>
                  {/if}
                {:else if result}
                  <span class="num">—</span> <span class="hint">no raw prices for this load</span>
                {:else}
                  <span class="num">—</span>
                {/if}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <!-- RIGHT: compare methods -->
      <section class="panel" aria-labelledby="compare-title">
        <div class="panel-head">
          <p class="step">Step 02</p>
          <h2 id="compare-title">Compare methods</h2>
        </div>

        <div class="source-row">
          <p class="source">
            {#if calc.source.text}<span data-testid="calc-source">{calc.source.text}</span>{/if}{#if calc.source.text && pricesAt}{" · "}{/if}{#if pricesAt}Prices from {formatAge(pricesAt, ordersState.nowMs)}{/if}
          </p>
          {#if result}
            <div class="sort" role="group" aria-label="Sort methods">
              <button type="button" class="toggle" aria-pressed={calc.sortBy === "net"} onclick={() => (calc.sortBy = "net")}>Best net</button>
              <button type="button" class="toggle" aria-pressed={calc.sortBy === "perHour"} onclick={() => (calc.sortBy = "perHour")}
                >Best per hour</button
              >
            </div>
          {/if}
        </div>

        {#if calc.provisional}
          <p class="provisional" data-testid="calc-provisional">Some values are assumptions (est.). Save a terminal quote for this material to make them exact.</p>
        {/if}

        {#if !result}
          <p class="empty muted">{calc.reason ?? "Pick a station and add at least one material."}</p>
        {:else}
          {#if missing.length}
            <p class="warning" role="note">
              No refined price for {missing.map(materialName).join(", ")}. {missing.length === 1 ? "It is" : "They are"} left
              out of revenue.
            </p>
          {/if}

          <div class="table-wrap">
            <table>
              <caption class="sr-only"
                >Refining methods compared for this load, sorted by {calc.sortBy === "net" ? "net profit" : "profit per hour"}. Select one to save as an
                order.</caption
              >
              <thead>
                <tr>
                  <th scope="col" class="method-col">Method</th>
                  <th scope="col" abbr="Refined yield in SCU">Yield</th>
                  <th scope="col" abbr="Cost in aUEC">Cost</th>
                  <th scope="col">Time</th>
                  <th scope="col" abbr="Net profit in aUEC">Net</th>
                  <th scope="col" abbr="Profit per hour in aUEC"><span aria-hidden="true">/h</span><span class="sr-only">Per hour</span></th>
                </tr>
                <tr class="units-row" aria-hidden="true">
                  <td class="method-col"></td>
                  <td>SCU</td>
                  <td>aUEC</td>
                  <td></td>
                  <td>aUEC</td>
                  <td>aUEC</td>
                </tr>
              </thead>
              <tbody>
                {#each calc.rows as m (m.methodId)}
                  {@const isSelected = calc.selected === m.methodId}
                  <tr class:selected={isSelected} onclick={() => (calc.selectedMethodId = m.methodId)}>
                    <th scope="row" class="method-col">
                      <label>
                        <input
                          type="radio"
                          name="calc-method"
                          value={m.methodId}
                          checked={isSelected}
                          onchange={() => (calc.selectedMethodId = m.methodId)}
                        />
                        <span class="method-name">{m.name}</span>
                        {#if m.params.lowConfidence}
                          <span class="approx" title="Estimate: uses assumed values for a material" aria-hidden="true">~</span>
                          <span class="sr-only">(early estimate)</span>
                        {/if}
                        {#if m.methodId === result.bestNet}<span class="tag tag-net">Best net</span>{/if}
                        {#if m.methodId === result.bestPerHour}<span class="tag tag-hour">Best /h</span>{/if}
                      </label>
                    </th>
                    <td class="num">{scu(m.totalRefinedCScu)}</td>
                    <td class="num">{auec(m.costAuec)}</td>
                    <td class="num">{formatDuration(m.durationSec)}</td>
                    <td class="num strong" class:neg={m.netAuec < 0}>{auec(m.netAuec)}</td>
                    <td class="num">{auec(m.perHourAuec)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <div class="footer">
            <p>Selected: <strong>{selectedName ?? "—"}</strong></p>
            <button type="button" class="btn btn-primary" disabled={!calc.selected} onclick={saveAsOrder}>Save as order →</button>
          </div>
        {/if}
      </section>
    </div>
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .head .eyebrow {
    margin: 0;
  }

  .head h1 {
    margin: 0;
    font-size: 30px;
  }

  /* Stacked below 1300 px, two equal halves from 1300 px up. */
  .panels {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    align-items: start;
  }

  @media (min-width: 1300px) {
    .panels {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--color-accent);
  }

  @media (min-width: 480px) {
    .panel {
      padding: var(--space-4) 20px;
    }
  }

  .panel-head {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .panel-head h2 {
    margin: 0;
    font-size: 22px;
  }

  /* Clear sits at the right of the Step 01 header */
  .panel-head .clear {
    margin-left: auto;
    min-height: 32px;
    margin-block: -6px;
  }

  @media (max-width: 959px) {
    .panel-head .clear {
      min-height: var(--touch);
      margin-block: -10px;
    }
  }

  .step {
    margin: 0;
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .station-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }

  .station-row > :global(.combo) {
    flex: 1 1 260px;
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

  input[type="text"]:hover {
    border-color: #4a5058;
  }

  input[aria-invalid="true"] {
    border-color: #e5484d;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 4px;
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

  .line {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 140px var(--touch);
    grid-template-areas: "name qty remove" "error error error";
    align-items: center;
    gap: 2px var(--space-2);
    padding: 0 0 0 var(--space-3);
    border: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  .line .qty input,
  .line .remove {
    border-top: 0;
    border-bottom: 0;
  }

  .line-name {
    grid-area: name;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-2);
    min-width: 0;
  }

  .material-name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .qty {
    grid-area: qty;
    position: relative;
  }

  .qty input {
    padding-right: 52px;
    font-family: var(--font-mono);
    font-weight: 500;
    text-align: right;
  }

  .unit {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .remove {
    grid-area: remove;
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

  .field-error {
    grid-area: error;
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }

  .totals {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--color-border);
  }

  .totals dl {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-6);
    margin: 0;
  }

  .totals dl div {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 var(--space-2);
  }

  dt {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  dd {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--space-2);
    margin: 0;
  }

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  .hint {
    color: var(--color-muted);
    font-size: 14px;
  }

  .hint.warn {
    color: var(--color-accent);
  }

  .source-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
  }

  .source {
    margin: 0;
    color: var(--color-muted);
    font-size: 15px;
  }

  .provisional {
    margin: 0;
    padding: 6px var(--space-3);
    border: 1px solid var(--color-accent);
    color: var(--color-text);
    font-size: 14px;
  }

  .warning {
    margin: 0;
    padding: 6px var(--space-3);
    border-left: 4px solid var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-panel));
    font-size: 14px;
  }

  .empty {
    margin: 0;
    padding: var(--space-6) 0;
    text-align: center;
  }

  .sort {
    display: flex;
    gap: var(--space-2);
  }

  .toggle {
    min-height: 36px;
    padding: 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: 14px;
    cursor: pointer;
  }

  @media (max-width: 959px) {
    .toggle {
      min-height: var(--touch);
    }
  }

  .toggle[aria-pressed="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  /* Below ~1200 px the table scrolls inside its box with a sticky method
     column; wider, it fits its half (short headers, wrapping names). */
  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  th,
  td {
    padding: 3px 6px;
    border-bottom: 1px solid var(--color-border);
    text-align: right;
    white-space: nowrap;
  }

  thead th {
    padding-top: 6px;
    padding-bottom: 0;
    border-bottom: 0;
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--color-panel);
  }

  .units-row td {
    padding-top: 0;
    padding-bottom: 4px;
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--color-panel);
  }

  .method-col {
    position: sticky;
    left: 0;
    z-index: 1;
    min-width: 200px;
    padding-left: var(--space-3);
    text-align: left;
    white-space: normal;
    background: var(--color-panel);
  }

  tbody th.method-col {
    font-weight: 400;
  }

  tbody tr {
    cursor: pointer;
  }

  tbody tr:hover td,
  tbody tr:hover th {
    background: #252931;
  }

  tbody tr.selected td,
  tbody tr.selected th {
    background: color-mix(in srgb, var(--color-accent) 12%, var(--color-panel));
  }

  tbody tr.selected th.method-col {
    box-shadow: inset 3px 0 0 var(--color-accent);
  }

  .method-col label {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px var(--space-2);
    min-height: var(--touch);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  /* Desktop: compact rows (the whole row is the target). */
  @media (min-width: 960px) {
    .method-col label {
      min-height: 34px;
    }
  }

  input[type="radio"] {
    flex: none;
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--color-accent);
  }

  .approx {
    color: var(--color-muted);
    font-family: var(--font-mono);
  }

  .tag {
    padding: 1px 6px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-on-accent);
    white-space: nowrap;
  }

  .tag-net {
    background: var(--color-ready);
  }

  .tag-hour {
    background: var(--color-accent);
  }

  .strong {
    color: var(--color-text);
    font-weight: 500;
  }

  .neg {
    color: #ff8b8e;
  }

  .footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .footer p {
    margin: 0;
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-left: 4px solid #e5484d;
    background: var(--color-panel);
  }

  .notice p {
    margin: 0;
  }

  @media (max-width: 480px) {
    .line {
      grid-template-columns: minmax(0, 1fr) 120px var(--touch);
    }

    .method-col {
      min-width: 0;
      max-width: 140px;
    }

    .method-col label {
      font-size: 14px;
    }
  }
</style>
