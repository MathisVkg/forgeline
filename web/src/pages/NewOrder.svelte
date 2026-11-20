<script>
  import { onMount } from "svelte";
  import OrderForm from "../components/OrderForm.svelte";
  import { router } from "../lib/router.svelte.js";
  import { draft } from "../lib/stores/draft.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { ordersState } from "../lib/stores/orders.svelte.js";
  import { DEFAULT_SETTINGS, getSettings } from "../lib/storage/settings.js";

  /** @type {import("../lib/orders/form.js").FormSettings | null} */
  let settings = $state(null);

  onMount(() => {
    getSettings()
      .then((s) => (settings = s))
      .catch(() => (settings = { ...DEFAULT_SETTINGS }));
  });

  const editId = $derived(router.query.edit ?? null);
  const fromEstimate = $derived(router.query.from === "estimate");
  const ready = $derived(settings !== null && gameData.loaded && (!editId || ordersState.loaded));
  const editing = $derived(editId ? (ordersState.orders.find((o) => o.id === editId) ?? null) : null);
  // Re-create the form when the route changes (new <-> edit <-> from estimate).
  const formKey = $derived(`${editId ?? ""}|${fromEstimate}|${draft.current?.createdAtMs ?? ""}`);
</script>

<section class="page" aria-labelledby="new-title">
  <header class="head">
    <p class="eyebrow">{editId ? "Work order" : "Quick entry"}</p>
    <h1 id="new-title">{editId ? "Edit order" : "New order"}</h1>
    {#if !editId}
      <p class="muted lead">Copy what the refinery terminal shows. Only the time left is required.</p>
    {/if}
  </header>

  {#if !ready}
    <p class="muted" aria-live="polite">Loading…</p>
  {:else if !gameData.staticData}
    <div class="notice" role="alert"><p>{gameData.error}</p></div>
  {:else if editId && !editing}
    <div class="notice" role="alert">
      <p>This order doesn't exist anymore. It may have been deleted, or removed after 14 days in history.</p>
      <a class="btn" href="#/orders">Back to orders</a>
    </div>
  {:else if settings}
    {#key formKey}
      <OrderForm {settings} order={editing ? $state.snapshot(editing) : null} draft={draft.current ? $state.snapshot(draft.current) : null} {fromEstimate} />
    {/key}
  {/if}
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 880px;
  }

  .head h1 {
    margin: 0;
    font-size: 40px;
  }

  .lead {
    margin: var(--space-2) 0 0;
  }

  .notice {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-left: 4px solid #e5484d;
    background: var(--color-panel);
  }

  .notice p {
    margin: 0 0 var(--space-3);
  }

  @media (max-width: 480px) {
    .head h1 {
      font-size: 32px;
    }
  }
</style>
