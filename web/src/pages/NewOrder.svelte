<script>
  import { router } from "../lib/router.svelte.js";
  import { draft } from "../lib/stores/draft.svelte.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";

  // Placeholder until Task 8: proves the calculator hand-off works.
  const received = $derived(router.query.from === "estimate" ? draft.current : null);
</script>

<h1>New order</h1>
<p class="muted">Coming in Task 8.</p>

{#if received}
  <p class="draft" data-testid="draft-received">
    Draft received: {gameData.methodName(received.methodId)}, {received.materials.length} material{received.materials.length === 1
      ? ""
      : "s"}
  </p>
{/if}

<style>
  .draft {
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-ready);
  }
</style>
