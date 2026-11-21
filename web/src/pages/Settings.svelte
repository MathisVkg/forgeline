<script>
  import { onMount, tick } from "svelte";
  import { APP_NAME, formatAge } from "@forgeline/shared";
  import UnitToggle from "../components/pickers/UnitToggle.svelte";
  import { downloadBackup, storageInfo } from "../lib/storage/index.js";
  import { clearAllData } from "../lib/storage/clear.js";
  import { importPreview, orderSummary, previewText, sharedQuoteCount, versionString } from "../lib/settings/logic.js";
  import { gameData } from "../lib/stores/gameData.svelte.js";
  import { importFromFile, ordersState, refresh } from "../lib/stores/orders.svelte.js";
  import { clearLastStation, markBackupDone, prefs, resetPrefs } from "../lib/stores/prefs.svelte.js";
  import { showToast } from "../lib/stores/toast.svelte.js";
  import { calc } from "../lib/calculator/state.svelte.js";
  import { clearDraft } from "../lib/stores/draft.svelte.js";

  const summary = $derived(orderSummary(ordersState.orders, ordersState.nowMs));
  const version = versionString(APP_NAME, __APP_VERSION__, __BUILD_SHA__);
  const quotes = $derived(sharedQuoteCount(gameData.aggregates));

  /** @type {{ persisted: boolean, usageBytes: number | null, quotaBytes: number | null } | null} */
  let storage = $state(null);
  onMount(() => {
    storageInfo().then((info) => (storage = info));
  });

  /** @param {number} bytes */
  function size(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // ---------- export ----------
  let exporting = $state(false);
  async function exportBackup() {
    exporting = true;
    try {
      const { fileName, count } = await downloadBackup();
      markBackupDone();
      showToast(`Backup saved: ${fileName} (${count} order${count === 1 ? "" : "s"})`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "The backup could not be saved.");
    } finally {
      exporting = false;
    }
  }

  // ---------- import (preview before writing) ----------
  /** @type {HTMLInputElement | undefined} */
  let fileInput = $state();
  /** @type {File | null} */
  let file = $state(null);
  /** @type {ReturnType<typeof importPreview> | null} */
  let preview = $state(null);
  let importing = $state(false);

  /** @param {Event} e */
  async function onFile(e) {
    const input = /** @type {HTMLInputElement} */ (e.currentTarget);
    const chosen = input.files?.[0] ?? null;
    input.value = "";
    if (!chosen) return;
    file = chosen;
    if (chosen.size > 5 * 1024 * 1024) {
      preview = { ok: false, error: "This file is too large (over 5 MB) to be a Forgeline backup." };
      return;
    }
    preview = importPreview(await chosen.text(), $state.snapshot(ordersState.orders));
  }

  function cancelImport() {
    file = null;
    preview = null;
  }

  async function confirmImport() {
    if (!file) return;
    importing = true;
    try {
      const r = await importFromFile(file);
      if (!r.ok) {
        preview = { ok: false, error: r.errors[0] ?? "This file can't be imported." };
        return;
      }
      showToast(`Imported: ${r.added} new, ${r.updated} updated${r.invalid ? `, ${r.invalid} invalid skipped` : ""}`);
      cancelImport();
    } finally {
      importing = false;
    }
  }

  // ---------- preferences ----------
  async function forgetStation() {
    await clearLastStation();
    showToast("Last station cleared");
  }

  // ---------- clear all ----------
  let confirmingClear = $state(false);
  /** @type {HTMLButtonElement | undefined} */
  let keepButton = $state();
  async function askClear() {
    confirmingClear = true;
    await tick();
    keepButton?.focus();
  }

  async function deleteEverything() {
    try {
      await clearAllData();
      resetPrefs();
      calc.clear();
      clearDraft();
      await refresh();
      confirmingClear = false;
      storage = await storageInfo();
      showToast("All data deleted");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "The data could not be deleted.");
    }
  }
</script>

<section class="page" aria-labelledby="settings-title">
  <header class="head">
    <p class="eyebrow">Settings</p>
    <h1 id="settings-title">Settings & backup</h1>
  </header>

  <!-- 1. Your orders -->
  <section class="panel" aria-labelledby="orders-h">
    <h2 id="orders-h">Your orders</h2>
    <p class="summary">
      <span class="num">{summary.total}</span> order{summary.total === 1 ? "" : "s"}{" "}<span class="muted"
        >({summary.refining} refining, {summary.ready} ready, {summary.history} in history)</span
      >
    </p>
    <p class="muted" data-testid="storage-status">
      Stored in this browser · {storage === null ? "checking…" : storage.persisted ? "persistent" : "may be cleared by the browser"}{#if storage?.usageBytes != null}{" · "}{size(storage.usageBytes)} used{/if}
    </p>
    {#if prefs.lastBackupAt}
      <p class="muted">Last backup {formatAge(prefs.lastBackupAt, ordersState.nowMs)}.</p>
    {/if}

    <div class="actions">
      <button type="button" class="btn btn-primary" disabled={exporting} onclick={exportBackup}>Export backup</button>
      <button type="button" class="btn" onclick={() => fileInput?.click()}>Import backup…</button>
      <input bind:this={fileInput} id="import-file" class="sr-only" type="file" accept=".json,application/json" tabindex="-1" aria-hidden="true" onchange={onFile} />
    </div>

    {#if preview}
      {#if preview.ok}
        <div class="preview" role="status" data-testid="import-preview">
          <p><strong>{file?.name}</strong></p>
          <p>{previewText(preview)}</p>
          <div class="actions">
            <button type="button" class="btn btn-primary" disabled={importing || preview.added + preview.updated === 0} onclick={confirmImport}>Import</button>
            <button type="button" class="btn" onclick={cancelImport}>Cancel</button>
          </div>
          {#if preview.added + preview.updated === 0}<p class="muted">Nothing to import: you already have these orders.</p>{/if}
        </div>
      {:else}
        <div class="preview error" role="alert" data-testid="import-error">
          <p>{preview.error}</p>
          <button type="button" class="btn" onclick={cancelImport}>OK</button>
        </div>
      {/if}
    {/if}
  </section>

  <!-- 2. Preferences -->
  <section class="panel" aria-labelledby="prefs-h">
    <h2 id="prefs-h">Preferences</h2>
    <div class="row">
      <div>
        <p class="label">Quantity unit</p>
        <p class="muted small">Used by the calculator and the order form.</p>
      </div>
      <UnitToggle />
    </div>
    <div class="row">
      <div>
        <p class="label">Last station</p>
        <p class="muted small">The station and method the order form starts with, and the “Last” chip.</p>
      </div>
      <button type="button" class="btn" onclick={forgetStation}>Clear last station</button>
    </div>
  </section>

  <!-- 3. Game data -->
  <section class="panel" aria-labelledby="game-h">
    <h2 id="game-h">Game data</h2>
    {#if gameData.staticData}
      <dl class="facts">
        <div><dt>Patch</dt><dd class="num">{gameData.staticData.patch ?? "—"}</dd></div>
        <div><dt>Stations & materials</dt><dd>updated {formatAge(gameData.staticData.generatedAt, ordersState.nowMs)}</dd></div>
        <div><dt>Prices</dt><dd>{gameData.prices ? `updated ${formatAge(gameData.prices.generatedAt, ordersState.nowMs)}` : "not available"}</dd></div>
        <div><dt>Shared quotes</dt><dd>{quotes > 0 ? quotes : "none yet"}</dd></div>
      </dl>
    {:else}
      <p class="muted">{gameData.error ?? "Loading…"}</p>
    {/if}
    <p class="muted small">Game data and prices come from UEX and refresh once a day.</p>
  </section>

  <!-- 4. About -->
  <section class="panel" aria-labelledby="about-h">
    <h2 id="about-h">About</h2>
    <p class="num" data-testid="version">{version}</p>
    <p class="links">
      <a href="#/privacy">Privacy</a>
      <a href="https://github.com/MathisVkg/forgeline" rel="noopener noreferrer" target="_blank">Source on GitHub</a>
      <a href="https://uexcorp.space" rel="noopener noreferrer" target="_blank">UEX</a>
    </p>
  </section>

  <!-- Danger zone -->
  <section class="panel danger" aria-labelledby="danger-h">
    <h2 id="danger-h">Clear all data</h2>
    {#if confirmingClear}
      <div class="confirm" role="group" aria-label="Confirm">
        <p>This deletes all orders and settings in this browser. It can't be undone.</p>
        <div class="actions">
          <button type="button" class="btn" disabled={exporting} onclick={exportBackup}>Export first</button>
          <button type="button" class="btn btn-danger" onclick={deleteEverything}>Delete everything</button>
          <button type="button" class="btn" bind:this={keepButton} onclick={() => (confirmingClear = false)}>Keep</button>
        </div>
      </div>
    {:else}
      <p class="muted small">Deletes every order and setting stored in this browser.</p>
      <div class="actions">
        <button type="button" class="btn btn-danger" onclick={askClear}>Clear all data…</button>
      </div>
    {/if}
  </section>
</section>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 900px;
  }

  .head .eyebrow {
    margin: 0;
  }

  .head h1 {
    margin: 0;
    font-size: 30px;
  }

  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) 20px;
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-top: 3px solid var(--color-accent);
  }

  .panel.danger {
    border-top-color: #e5484d;
  }

  h2 {
    margin: 0 0 var(--space-1);
    font-size: 22px;
  }

  p {
    margin: 0;
  }

  .summary {
    font-size: 17px;
  }

  .num {
    font-family: var(--font-mono);
    font-weight: 500;
  }

  .small {
    font-size: 14px;
  }

  .label {
    font-weight: 600;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-2) 0;
  }

  .row + .row {
    border-top: 1px solid var(--color-border);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--color-border);
    border-left: 4px solid var(--color-ready);
    background: var(--color-bg);
  }

  .preview.error {
    border-left-color: #e5484d;
  }

  .facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-3);
    margin: 0;
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
    margin: 2px 0 0;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .links a {
    display: inline-flex;
    align-items: center;
    min-height: var(--touch);
  }

  .confirm {
    padding: var(--space-3);
    border: 1px solid #e5484d;
    background: color-mix(in srgb, #e5484d 8%, var(--color-panel));
  }

  .confirm p {
    font-weight: 600;
  }
</style>
