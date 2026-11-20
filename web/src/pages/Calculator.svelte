<script>
  import { formatAge, formatAuec, formatDuration, formatScu } from "@forgeline/shared";
  import { calc } from "../lib/calculator/state.svelte.js";
  import {
    DRAFT_ROUTE,
    MAX_CALC_LINES,
    bonusFor,
    buildDraft,
    groupMaterials,
    groupStations,
    refinedPricesDate,
    stationLabel,
    usedElsewhere,
  } from "../lib/calculator/logic.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { ordersState } from "../lib/stores/orders.svelte.js";
  import { setDraft } from "../lib/stores/draft.svelte.js";

  const stationGroups = $derived(groupStations(gameData.staticData));
  const materialGroups = $derived(groupMaterials(gameData.staticData));
  const result = $derived(calc.result);
  const missing = $derived(result?.methods[0]?.missingPrices ?? []);
  const pricesAt = $derived(refinedPricesDate(result, gameData.staticData, gameData.prices));
  const selectedName = $derived(calc.selected ? gameData.methodName(calc.selected) : null);

  // Restore saved inputs once game data is known, then save on every change.
  $effect(() => {
    if (gameData.staticData) calc.restore();
  });
  $effect(() => {
    if (!calc.restored) return;
    // read everything that is persisted so the effect tracks it
    void [calc.stationId, calc.sortBy, calc.selectedMethodId, ...calc.lines.map((l) => l.materialId + l.scuText)];
    calc.save();
  });

  function saveAsOrder() {
    if (!result || !calc.selected) return;
    setDraft(buildDraft(result, calc.selected, gameData.prices, gameData.staticData?.patch ?? null, Date.now()));
    location.hash = DRAFT_ROUTE;
  }

  /** @param {string} id */
  const materialName = (id) => gameData.materialName(id);
  // Table cells show numbers only; the unit is in the column header.
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
    <div class="notice error" role="alert">
      <p>{gameData.error}</p>
      <p class="muted">The calculator needs stations, materials and prices from the server.</p>
    </div>
  {:else}
    <div class="panels">
      <!-- LEFT: raw load -->
      <section class="panel" aria-labelledby="load-title">
        <p class="step">Step 01</p>
        <h2 id="load-title">Raw load</h2>

        <div class="field">
          <label for="calc-station">Refinery station</label>
          <select id="calc-station" bind:value={calc.stationId}>
            <option value="">Choose a station…</option>
            {#each stationGroups as group (group.system)}
              <optgroup label={group.system}>
                {#each group.stations as s (s.id)}
                  <option value={s.id}>{stationLabel(s)}</option>
                {/each}
              </optgroup>
            {/each}
          </select>
        </div>

        <fieldset class="lines">
          <legend>Materials</legend>
          {#each calc.lines as line, i (line.key)}
            {@const parsed = calc.parsed[i]}
            {@const used = usedElsewhere(calc.lines, line.key)}
            {@const bonus = bonusFor(gameData.staticData, calc.stationId, line.materialId)}
            <div class="line">
              <div class="line-inputs">
                <label class="sr-only" for="mat-{line.key}">Material {i + 1}</label>
                <select id="mat-{line.key}" bind:value={line.materialId}>
                  <option value="">Material…</option>
                  {#each materialGroups as group (group.label)}
                    <optgroup label={group.label}>
                      {#each group.items as m (m.id)}
                        <option value={m.id} disabled={used.has(m.id)}>{m.name}</option>
                      {/each}
                    </optgroup>
                  {/each}
                </select>
                <label class="sr-only" for="scu-{line.key}">Raw SCU for material {i + 1}</label>
                <div class="scu">
                  <input
                    id="scu-{line.key}"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    placeholder="0"
                    bind:value={line.scuText}
                    aria-invalid={parsed?.error ? "true" : undefined}
                    aria-describedby={parsed?.error ? `err-${line.key}` : bonus ? `bonus-${line.key}` : undefined}
                  />
                  <span class="unit" aria-hidden="true">SCU</span>
                </div>
                <button
                  type="button"
                  class="remove"
                  aria-label="Remove material {i + 1}"
                  onclick={() => calc.removeLine(line.key)}>×</button
                >
              </div>
              {#if parsed?.error}
                <p class="field-error" id="err-{line.key}">{parsed.error}</p>
              {:else if bonus}
                <p class="bonus" class:penalty={bonus < 0} id="bonus-{line.key}">
                  {bonus > 0 ? "+" : "−"}{Math.abs(bonus)}% yield at this station
                </p>
              {/if}
            </div>
          {/each}
          <button type="button" class="btn add" disabled={calc.lines.length >= MAX_CALC_LINES} onclick={() => calc.addLine()}>
            + Add material
          </button>
        </fieldset>

        <dl class="totals">
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

        <button type="button" class="btn btn-ghost" onclick={() => calc.clear()}>Clear</button>
      </section>

      <!-- RIGHT: compare methods -->
      <section class="panel" aria-labelledby="compare-title">
        <p class="step">Step 02</p>
        <h2 id="compare-title">Compare methods</h2>

        <p class="source">
          {calc.source.text}{#if pricesAt}{" · "}Prices from {formatAge(pricesAt, ordersState.nowMs)}{/if}
        </p>

        {#if calc.provisional}
          <p class="provisional">
            Costs and times are early estimates. They improve as players share real terminal quotes.
          </p>
        {/if}

        {#if !result}
          <p class="empty muted">{calc.reason ?? "Pick a station and add at least one material."}</p>
        {:else}
          <div class="sort" role="group" aria-label="Sort methods">
            <button type="button" class="toggle" aria-pressed={calc.sortBy === "net"} onclick={() => (calc.sortBy = "net")}>
              Best net
            </button>
            <button
              type="button"
              class="toggle"
              aria-pressed={calc.sortBy === "perHour"}
              onclick={() => (calc.sortBy = "perHour")}>Best per hour</button
            >
          </div>

          {#if missing.length}
            <p class="warning" role="note">
              No refined price for {missing.map(materialName).join(", ")}. {missing.length === 1 ? "It is" : "They are"} left
              out of revenue.
            </p>
          {/if}

          <div class="table-wrap">
            <table>
              <caption class="sr-only">Refining methods compared for this load, sorted by {calc.sortBy === "net" ? "net profit" : "profit per hour"}. Select one to save as an order.</caption>
              <thead>
                <tr>
                  <th scope="col" class="method-col">Method</th>
                  <th scope="col">Yield <span class="unit-h">SCU</span></th>
                  <th scope="col">Cost <span class="unit-h">aUEC</span></th>
                  <th scope="col">Time</th>
                  <th scope="col">Net profit <span class="unit-h">aUEC</span></th>
                  <th scope="col">Per hour <span class="unit-h">aUEC</span></th>
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
                          <span class="approx" title="Early estimate: fewer than 5 real quotes" aria-hidden="true">~</span>
                          <span class="sr-only">(early estimate)</span>
                        {/if}
                      </label>
                      {#if m.methodId === result.bestNet || m.methodId === result.bestPerHour}
                        <span class="tags">
                          {#if m.methodId === result.bestNet}<span class="tag tag-net">Best net</span>{/if}
                          {#if m.methodId === result.bestPerHour}<span class="tag tag-hour">Best /h</span>{/if}
                        </span>
                      {/if}
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
            <button type="button" class="btn btn-primary" disabled={!calc.selected} onclick={saveAsOrder}>
              Save as order →
            </button>
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
    gap: var(--space-6);
  }

  .head h1 {
    margin: 0;
    font-size: 40px;
  }

  .panels {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-4);
    align-items: start;
  }

  @media (min-width: 960px) {
    .panels {
      grid-template-columns: minmax(0, 4fr) minmax(0, 7fr);
    }
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    padding: var(--space-6) var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--color-accent);
  }

  @media (min-width: 480px) {
    .panel {
      padding: var(--space-6);
    }
  }

  .panel h2 {
    margin: -12px 0 0;
    font-size: 26px;
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

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  label,
  legend {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  select,
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

  select:hover,
  input[type="text"]:hover {
    border-color: #4a5058;
  }

  input[aria-invalid="true"] {
    border-color: #e5484d;
  }

  option:disabled {
    color: #6b7280;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    border: 0;
  }

  .lines legend {
    margin-bottom: var(--space-1);
    padding: 0;
  }

  .line-inputs {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 128px var(--touch);
    gap: var(--space-2);
  }

  .scu {
    position: relative;
  }

  .scu input {
    padding-right: 46px;
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

  .field-error,
  .bonus {
    margin: var(--space-1) 0 0;
    font-size: 14px;
  }

  .field-error {
    color: #ff8b8e;
  }

  .bonus {
    color: var(--color-ready);
  }

  .bonus.penalty {
    color: var(--color-accent);
  }

  .add {
    align-self: flex-start;
  }

  .totals {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-4) 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  .totals div {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-2);
  }

  dt {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  dd {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin: 0;
    text-align: right;
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

  .source {
    margin: 0;
    color: var(--color-muted);
  }

  .provisional {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-accent);
    color: var(--color-text);
  }

  .warning {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-left: 4px solid var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 8%, var(--color-panel));
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
    min-height: var(--touch);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: transparent;
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
  }

  .toggle[aria-pressed="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 15px;
  }

  th,
  td {
    padding: var(--space-2) var(--space-2);
    border-bottom: 1px solid var(--color-border);
    text-align: right;
    white-space: nowrap;
  }

  thead th {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    background: var(--color-panel);
  }

  .unit-h {
    display: block;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.04em;
  }

  .method-col {
    position: sticky;
    left: 0;
    z-index: 1;
    width: 1%;
    min-width: 132px;
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
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch);
    color: var(--color-text);
    font-family: var(--font-body);
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 0;
    text-transform: none;
    cursor: pointer;
  }

  input[type="radio"] {
    flex: none;
    width: 18px;
    height: 18px;
    accent-color: var(--color-accent);
  }

  .approx {
    color: var(--color-muted);
    font-family: var(--font-mono);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0 0 var(--space-2) 26px;
  }

  .tag {
    padding: 1px 6px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--color-on-accent);
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
    .head h1 {
      font-size: 32px;
    }

    .method-col {
      min-width: 0;
      max-width: 140px;
    }

    .method-col label {
      font-size: 14px;
    }

    .line-inputs {
      grid-template-columns: minmax(0, 1fr) 110px var(--touch);
    }
  }
</style>
