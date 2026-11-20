<script>
  import { dismissToast, runToastAction, toast } from "../lib/stores/toast.svelte.js";
</script>

<div class="region" role="status" aria-live="polite">
  {#if toast.current}
    {#key toast.current.id}
      <div class="toast">
        <span class="message">{toast.current.message}</span>
        {#if toast.current.actionLabel}
          <button type="button" class="action" onclick={runToastAction}>{toast.current.actionLabel}</button>
        {/if}
        <button type="button" class="close" onclick={dismissToast} aria-label="Dismiss">×</button>
      </div>
    {/key}
  {/if}
</div>

<style>
  .region {
    position: fixed;
    left: 0;
    right: 0;
    bottom: var(--space-4);
    display: flex;
    justify-content: center;
    padding: 0 var(--space-4);
    pointer-events: none;
    z-index: 20;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    max-width: 560px;
    width: 100%;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-accent);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.45);
  }

  .message {
    flex: 1;
  }

  button {
    min-height: var(--touch);
    min-width: var(--touch);
    border: 0;
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .action {
    padding: 0 var(--space-3);
    color: var(--color-accent);
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .close {
    color: var(--color-muted);
    font-size: 22px;
    line-height: 1;
  }

  button:hover {
    color: var(--color-text);
  }
</style>
