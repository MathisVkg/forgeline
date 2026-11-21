<script>
  import { formatScu } from "@forgeline/shared";
  import { ordersState } from "../lib/stores/orders.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { orderOutput, readyDialogDecision } from "../lib/orders/view.js";
  import { markCollected } from "../lib/orders/actions.svelte.js";

  /** @type {HTMLDialogElement | undefined} */
  let dialog = $state();
  /** Ready orders captured when the dialog opened (once per page load, in memory). */
  /** @type {string[]} */
  let ids = $state([]);
  let open = $state(false);
  let decided = false;

  $effect(() => {
    const decision = readyDialogDecision({
      storesReady: ordersState.loaded && gameData.loaded,
      readyCount: ordersState.readyOrders.length,
      decided,
    });
    if (decision === "wait") return;
    decided = true;
    if (decision === "open" && dialog) {
      ids = ordersState.readyOrders.map((o) => o.id);
      dialog.showModal();
      open = true;
    }
  });

  const rows = $derived(ordersState.readyOrders.filter((o) => ids.includes(o.id)));

  $effect(() => {
    if (open && rows.length === 0) dialog?.close();
  });
</script>

<dialog bind:this={dialog} aria-labelledby="ready-title" onclose={() => (open = false)}>
  <div class="content">
    <p class="eyebrow ready-label">Since your last visit</p>
    <h2 id="ready-title">
      {rows.length} order{rows.length === 1 ? "" : "s"} ready to collect
    </h2>
    <ul>
      {#each rows as order (order.id)}
        {@const output = orderOutput(order)}
        <li>
          <div class="info">
            <span class="title">{order.title}</span>
            <span class="meta">
              <span class="num">{gameData.stationShort(order.stationId)}</span>{" · "}<span class="num"
                >{formatScu(output.cScu)}</span
              >{output.kind === "raw" ? " raw" : output.kind === "estimate" ? " est." : ""}
            </span>
          </div>
          <button type="button" class="btn btn-ready" onclick={() => markCollected(order)}>Collected</button>
        </li>
      {/each}
    </ul>
    <div class="footer">
      <button type="button" class="btn" onclick={() => dialog?.close()}>Remind me later</button>
    </div>
  </div>
</dialog>

<style>
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--color-ready) 45%, var(--color-border));
    border-top: 4px solid var(--color-ready);
    background: var(--color-panel);
    color: var(--color-text);
  }

  dialog::backdrop {
    background: rgb(8 9 11 / 0.75);
  }

  .content {
    padding: var(--space-8);
  }

  .ready-label {
    margin: 0 0 var(--space-2);
    color: var(--color-ready);
  }

  h2 {
    margin: 0 0 var(--space-6);
    font-size: 28px;
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3) var(--space-4);
    padding: 18px 20px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
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

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 14px;
  }

  .footer {
    display: flex;
    justify-content: flex-end;
    margin-top: var(--space-6);
  }

  @media (max-width: 480px) {
    .content {
      padding: 20px;
    }

    li {
      padding: var(--space-4);
    }
  }
</style>
