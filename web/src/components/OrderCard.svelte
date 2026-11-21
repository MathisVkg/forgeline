<script>
  import { formatAuec, formatCountdown, formatEndTime, formatScu } from "@forgeline/shared";
  import { isReady, progress } from "../lib/storage/model.js";
  import { orderValue } from "../lib/orders/value.js";
  import { materialsLine, orderOutput } from "../lib/orders/view.js";
  import { cancelOrder, markCollected } from "../lib/orders/actions.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { stationButtonLabel } from "../lib/pickers.js";

  /** @type {{ order: import("../lib/storage/model.js").Order, nowMs: number }} */
  let { order, nowMs } = $props();

  const ready = $derived(isReady(order, nowMs));
  const pct = $derived(Math.round(progress(order, nowMs) * 100));
  const countdown = $derived(formatCountdown(order.endsAt, nowMs));
  const value = $derived(orderValue(order, gameData.staticData, gameData.prices));
  const output = $derived(orderOutput(order));
  const titleId = $derived(`order-${order.id}`);

  let confirming = $state(false);
  let busy = $state(false);
  /** @type {HTMLButtonElement | undefined} */
  let keepButton = $state();

  $effect(() => {
    if (confirming) keepButton?.focus();
  });

  /** @param {() => Promise<void>} action */
  async function run(action) {
    busy = true;
    try {
      await action();
    } finally {
      busy = false;
      confirming = false;
    }
  }
</script>

<article class="card" class:ready aria-labelledby={titleId}>
  <div class="bar" aria-hidden="true"></div>
  <div class="body">
    <!-- Ready cards get a badge; the countdown of refining cards is in the footer. -->
    {#if ready}
      <div class="top"><span class="badge badge-ready">READY</span></div>
    {/if}
    <span class="sr-only" aria-live="polite">{ready ? "Ready to collect" : ""}</span>

    <h2 id={titleId}>{order.title}</h2>
    <p class="where">
      <span class="station-chip" title={gameData.stationName(order.stationId)}
        >{stationButtonLabel(gameData.stationShort(order.stationId))}<span class="sr-only"> · {gameData.stationName(order.stationId)}</span></span
      >
    </p>

    <div class="when">
      <span class="countdown" class:is-ready={ready}>{ready ? "Ready" : countdown}</span>
      <span class="ends"><span class="ends-label">Ends</span> <span class="ends-at">{formatEndTime(order.endsAt, nowMs)}</span></span>
    </div>

    <div
      class="progress"
      role="progressbar"
      aria-label="Refining progress"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={pct}
    >
      <div class="fill" style:width="{pct}%"></div>
    </div>

    <dl class="stats">
      <div>
        <dt>Method</dt>
        <dd>{gameData.methodName(order.methodId)}</dd>
      </div>
      <div>
        <dt>Output</dt>
        <dd class="num">
          {formatScu(output.cScu)}
          {#if output.kind === "raw"}<span class="tag">raw</span>{:else if output.kind === "estimate"}<span class="tag">est.</span>{/if}
        </dd>
      </div>
      <div>
        <dt>Est. value</dt>
        <dd class="num">
          {#if value.auec === null}—{:else}{formatAuec(value.auec)}{#if value.basis === "estimate"}<span class="tag">est.</span>{/if}{/if}
        </dd>
      </div>
    </dl>

    <p class="materials">{materialsLine(order, (id) => gameData.materialName(id), formatScu)}</p>


    {#if confirming}
      <div class="confirm" role="group" aria-label="Confirm">
        <p>Cancel this order? It moves to history.</p>
        <div class="actions">
          <button type="button" class="btn btn-danger" disabled={busy} onclick={() => run(() => cancelOrder(order))}>Cancel order</button>
          <button type="button" class="btn" bind:this={keepButton} onclick={() => (confirming = false)}>Keep</button>
        </div>
      </div>
    {:else}
      <div class="actions">
        <button
          type="button"
          class="btn {ready ? 'btn-ready' : 'btn-ready-outline'}"
          disabled={busy}
          onclick={() => run(() => markCollected(order))}>Collected</button
        >
        <a class="btn" href="#/new?edit={encodeURIComponent(order.id)}">Edit</a>
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" onclick={() => (confirming = true)}>Cancel</button>
      </div>
    {/if}
  </div>
</article>

<style>
  .card {
    --tone: var(--color-accent);
    display: flex;
    flex-direction: column;
    min-width: 0;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
  }

  .card.ready {
    --tone: var(--color-ready);
    border-color: color-mix(in srgb, var(--color-ready) 45%, var(--color-border));
  }

  .bar {
    height: 4px;
    background: var(--tone);
  }

  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .top {
    display: flex;
  }

  .badge {
    padding: 2px var(--space-2);
    border: 1px solid var(--tone);
    color: var(--tone);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.04em;
  }

  .badge-ready {
    background: var(--color-ready);
    color: var(--color-on-accent);
  }

  h2 {
    margin: 0;
    font-size: 24px;
    overflow-wrap: anywhere;
  }

  /* Where: the station as an amber chip (amber on #33290d: 6.6:1). */
  .where {
    margin: -6px 0 0;
  }

  .station-chip {
    display: inline-block;
    padding: 2px var(--space-2);
    border: 1px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
    border-radius: var(--radius);
    background: #33290d;
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 14px;
    letter-spacing: 0.02em;
  }

  /* When: large countdown, amber while refining, teal when ready; end time in white. */
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-1) var(--space-3);
  }

  .countdown {
    color: var(--color-accent);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 21px;
    line-height: 1.2;
  }

  .countdown.is-ready {
    color: var(--color-ready);
  }

  .ends-label {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .ends-at {
    color: var(--color-text);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 15px;
  }

  /* Secondary: method / output / value. */
  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-2) 0;
    border-top: 1px solid var(--color-border);
    border-bottom: 1px solid var(--color-border);
  }

  dt {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  dd {
    margin: 2px 0 0;
    color: var(--color-text);
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
  }

  .tag {
    margin-left: 4px;
    color: var(--color-muted);
    font-family: var(--font-body);
    font-size: 12px;
  }

  .materials {
    margin: 0;
    color: var(--color-muted);
    font-size: 14px;
  }

  .progress {
    height: 6px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .fill {
    height: 100%;
    background: var(--tone);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .spacer {
    flex: 1;
  }

  .confirm {
    padding: var(--space-3);
    border: 1px solid #e5484d;
    background: color-mix(in srgb, #e5484d 8%, var(--color-panel));
  }

  .confirm p {
    margin: 0 0 var(--space-2);
    font-weight: 600;
  }
</style>
