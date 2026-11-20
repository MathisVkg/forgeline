<script>
  import { formatAge } from "@forgeline/shared";
  import { deleteWithUndo, undoStatus } from "../lib/orders/actions.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";

  /** @type {{ order: import("../lib/storage/model.js").Order, nowMs: number }} */
  let { order, nowMs } = $props();

  let confirming = $state(false);
  let busy = $state(false);
  /** @type {HTMLButtonElement | undefined} */
  let keepButton = $state();
  $effect(() => {
    if (confirming) keepButton?.focus();
  });

  const at = $derived(order.status === "collected" ? order.collectedAt : order.cancelledAt);

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

<li class="row">
  <div class="info">
    <span class="title">{order.title}</span>
    <span class="meta">
      {gameData.stationShort(order.stationId)} ·
      <span class="status" class:cancelled={order.status === "cancelled"}>
        {order.status === "collected" ? "Collected" : "Cancelled"}
      </span>
      · {at ? formatAge(at, nowMs) : ""}
    </span>
  </div>
  <div class="actions">
    {#if confirming}
      <span class="question">Delete this order?</span>
      <button type="button" class="btn btn-danger" disabled={busy} onclick={() => run(() => deleteWithUndo(order))}>Delete</button>
      <button type="button" class="btn" bind:this={keepButton} onclick={() => (confirming = false)}>Keep</button>
    {:else}
      <button type="button" class="btn" disabled={busy} onclick={() => run(() => undoStatus(order))}>Undo</button>
      <button type="button" class="btn btn-ghost" onclick={() => (confirming = true)}>Delete</button>
    {/if}
  </div>
</li>

<style>
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border);
  }

  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .meta {
    color: var(--color-muted);
    font-size: 15px;
  }

  .status {
    color: var(--color-ready);
  }

  .status.cancelled {
    color: var(--color-muted);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .question {
    font-weight: 600;
  }
</style>
