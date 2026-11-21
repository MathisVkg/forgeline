<script>
  import { formatAuec } from "@forgeline/shared";
  import OrderCard from "../components/OrderCard.svelte";
  import HistoryRow from "../components/HistoryRow.svelte";
  import { init, ordersState } from "../lib/stores/orders.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { filterByStation, stationChips, summarize } from "../lib/orders/view.js";
  import { HISTORY_DAYS } from "../lib/storage/model.js";

  /** @type {string | null} */
  let selected = $state(null);

  const chips = $derived(stationChips(ordersState.activeOrders, ordersState.nowMs, (id) => gameData.stationShort(id)));
  // A selected station with no active orders left falls back to "All".
  const station = $derived(selected && chips.some((c) => c.stationId === selected) ? selected : null);
  const active = $derived(filterByStation(ordersState.activeOrders, station));
  const history = $derived(filterByStation(ordersState.historyOrders, station));
  const summary = $derived(summarize(ordersState.activeOrders, ordersState.nowMs, gameData.staticData, gameData.prices));
  const empty = $derived(ordersState.loaded && !ordersState.error && ordersState.orders.length === 0);
</script>

<section class="page" aria-labelledby="orders-title">
  <header class="head">
    <div>
      <p class="eyebrow">Work orders</p>
      <h1 id="orders-title">Refinery orders</h1>
    </div>
    <a class="btn btn-primary new-order" href="#/new">+ New order</a>
  </header>

  {#if ordersState.error}
    <div class="notice error" role="alert">
      <p>{ordersState.error}</p>
      <button type="button" class="btn btn-primary" onclick={() => init()}>Try again</button>
    </div>
  {:else if !ordersState.loaded}
    <p class="muted" aria-live="polite">Loading your orders…</p>
    <div class="skeleton" aria-hidden="true"><div></div><div></div></div>
  {:else if empty}
    <div class="empty">
      <h2>No orders yet</h2>
      <p class="muted">Estimate a refinery job first, or add an order that's already refining at a station.</p>
      <div class="empty-actions">
        <a class="btn btn-primary" href="#/calculator">Open the calculator</a>
        <a class="btn" href="#/new">Add an order you already started</a>
      </div>
    </div>
  {:else}
    {#if gameData.loaded && gameData.error}
      <p class="notice info">{gameData.error} Names and values are shown when it is.</p>
    {/if}

    <div class="tiles">
      <div class="tile ready">
        <span class="tile-label">Ready</span>
        <span class="tile-value">{summary.ready}</span>
      </div>
      <div class="tile refining">
        <span class="tile-label">Refining</span>
        <span class="tile-value">{summary.refining}</span>
      </div>
      <div class="tile value">
        <span class="tile-label">Est. value</span>
        <span class="tile-value">
          {summary.valueAuec === null ? "—" : formatAuec(summary.valueAuec)}
        </span>
      </div>
    </div>

    {#if chips.length > 0}
      <div class="chips" role="group" aria-label="Filter by station">
        <button type="button" class="chip" aria-pressed={station === null} onclick={() => (selected = null)}>
          All stations
        </button>
        {#each chips as chip (chip.stationId)}
          <button
            type="button"
            class="chip"
            aria-pressed={station === chip.stationId}
            onclick={() => (selected = chip.stationId)}
          >
            {#if chip.ready}<span class="dot" aria-hidden="true"></span>{/if}
            <span class="num">{chip.label}</span>
            {#if chip.ready}<span class="sr-only">(has ready orders)</span>{/if}
          </button>
        {/each}
      </div>
    {/if}

    {#if active.length > 0}
      <div class="grid">
        {#each active as order (order.id)}
          <OrderCard {order} nowMs={ordersState.nowMs} />
        {/each}
      </div>
    {:else}
      <p class="muted">No active orders{station ? " at this station" : ""}.</p>
    {/if}

    {#if history.length > 0}
      <details class="history">
        <summary>
          <h2>History (last {HISTORY_DAYS} days) <span class="count num">{history.length}</span></h2>
        </summary>
        <ul>
          {#each history as order (order.id)}
            <HistoryRow {order} nowMs={ordersState.nowMs} />
          {/each}
        </ul>
      </details>
    {/if}
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
  }

  .head h1 {
    margin: 0;
    font-size: 40px;
  }

  /* Phones: the "+ New order" button goes under the title. */
  @media (max-width: 639px) {
    .head {
      flex-direction: column;
      align-items: flex-start;
    }
  }

  .tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .tile {
    --tone: var(--color-text);
    flex: 1 1 160px;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--tone);
  }

  .tile.ready {
    --tone: var(--color-ready);
  }

  .tile.refining {
    --tone: var(--color-accent);
  }

  .tile.value {
    flex-basis: 240px;
  }

  .tile-label {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .tile-value {
    color: var(--tone);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 28px;
    line-height: 1.2;
  }

  .tile.value .tile-value {
    color: var(--color-text);
    font-size: 24px;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--touch);
    padding: 0 var(--space-4);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-panel);
    color: var(--color-text);
    font: inherit;
    cursor: pointer;
  }

  .chip:hover {
    border-color: var(--color-accent);
  }

  .chip[aria-pressed="true"] {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-on-accent);
  }

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 14px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--color-ready);
    box-shadow: 0 0 0 2px var(--color-bg);
  }

  /* Equal columns; a lone card on the last row keeps the same width. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: var(--space-4);
  }

  .history {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
  }

  .history summary {
    display: flex;
    align-items: center;
    min-height: var(--touch);
    padding: var(--space-2) var(--space-4);
    gap: var(--space-2);
    cursor: pointer;
    list-style: none;
  }

  .history summary::-webkit-details-marker {
    display: none;
  }

  .history summary::before {
    content: "▸";
    color: var(--color-accent);
    font-size: 18px;
    transition: transform 0.15s;
  }

  .history[open] summary::before {
    transform: rotate(90deg);
  }

  .history summary h2 {
    display: inline;
    margin: 0;
    font-size: 20px;
  }

  .count {
    margin-left: var(--space-2);
    padding: 0 var(--space-2);
    border: 1px solid var(--color-border);
    color: var(--color-muted);
  }

  .history ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    background: var(--color-panel);
  }

  .notice p {
    margin: 0 0 var(--space-3);
  }

  .notice.info {
    margin: 0;
    color: var(--color-muted);
  }

  .notice.error {
    border-left: 4px solid #e5484d;
  }

  .empty {
    padding: var(--space-8) var(--space-6);
    background: var(--color-panel);
    border: 1px dashed var(--color-border);
    text-align: center;
  }

  .empty h2 {
    font-size: 26px;
  }

  .empty-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .skeleton {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .skeleton div {
    flex: 1 1 340px;
    height: 260px;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
  }

  @media (max-width: 480px) {
    .head h1 {
      font-size: 32px;
    }
  }
</style>
