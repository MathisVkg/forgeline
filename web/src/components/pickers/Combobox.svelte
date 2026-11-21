<script>
  import { tick } from "svelte";
  import { filterOptions, groupOptions } from "../../lib/pickers.js";

  /**
   * Editable combobox (ARIA 1.2 "combobox with listbox popup"). Typing
   * filters (ignoring case, spaces, dashes and dots); ↓/↑ move, Enter or Tab
   * selects, Escape closes (a second Escape clears the text). Free text that
   * doesn't select anything is replaced by the last valid choice on blur.
   * @type {{
   *   value: string,
   *   options: import("../../lib/pickers.js").ComboOption[],
   *   id: string,
   *   label: string,
   *   placeholder?: string,
   *   error?: string | null,
   *   picker?: string,
   *   inline?: boolean,
   *   onchange?: (id: string) => void,
   *   onblur?: () => void,
   * }}
   */
  let { value = $bindable(""), options, id, label, placeholder = "", error = null, picker = "", inline = false, onchange, onblur } = $props();

  const listId = $derived(`${id}-list`);
  const selected = $derived(options.find((o) => o.id === value) ?? null);

  let text = $state("");
  let open = $state(false);
  /** Typed text used for filtering; null = show everything (just opened). */
  let query = $state(/** @type {string | null} */ (null));
  let active = $state(-1);
  let above = $state(false);
  /** @type {HTMLInputElement | undefined} */
  let input = $state();
  /** @type {HTMLUListElement | undefined} */
  let list = $state();

  // Closed: the input shows the selected value.
  $effect(() => {
    const display = selected?.display ?? "";
    if (!open) text = display;
  });

  const visible = $derived(query === null ? options : filterOptions(options, query));
  const groups = $derived(
    visible.length === 0 ? [] : query === null || query.trim() === "" ? groupOptions(visible) : [{ group: "", options: visible }],
  );
  const activeOption = $derived(active >= 0 ? visible[active] : undefined);
  const optionId = (/** @type {string} */ optId) => `${id}-opt-${optId}`;

  /** @param {boolean} [showAll] */
  async function openList(showAll = true) {
    if (!open) {
      const rect = input?.getBoundingClientRect();
      if (rect) {
        const below = window.innerHeight - rect.bottom;
        above = below < 240 && rect.top > below;
      }
    }
    open = true;
    if (showAll) {
      query = null;
      active = Math.max(0, options.findIndex((o) => o.id === value));
    }
    await scrollActive();
  }

  function close() {
    open = false;
    query = null;
    active = -1;
    text = selected?.display ?? "";
  }

  /** @param {import("../../lib/pickers.js").ComboOption} option */
  function choose(option) {
    value = option.id;
    onchange?.(option.id);
    open = false;
    query = null;
    active = -1;
    text = option.display;
  }

  async function scrollActive() {
    await tick();
    const el = activeOption ? document.getElementById(optionId(activeOption.id)) : null;
    el?.scrollIntoView({ block: "nearest" });
  }

  /** @param {Event} e */
  function onInput(e) {
    text = /** @type {HTMLInputElement} */ (e.currentTarget).value;
    query = text;
    open = true;
    active = visible.length ? 0 : -1;
  }

  /** @param {KeyboardEvent} e */
  async function onKeydown(e) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) return openList(true);
        if (visible.length) active = (active + 1) % visible.length;
        return scrollActive();
      case "ArrowUp":
        e.preventDefault();
        if (!open) return openList(true);
        if (visible.length) active = active <= 0 ? visible.length - 1 : active - 1;
        return scrollActive();
      case "Home":
      case "End":
        if (!open || !visible.length) return;
        e.preventDefault();
        active = e.key === "Home" ? 0 : visible.length - 1;
        return scrollActive();
      case "Enter":
        if (open && activeOption) {
          e.preventDefault();
          choose(activeOption);
        } else if (open) {
          e.preventDefault();
        }
        return;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        } else if (text) {
          e.preventDefault();
          text = "";
        }
        return;
      case "Tab":
        if (open && activeOption) choose(activeOption);
        else if (open) close();
        return;
    }
  }

  function onBlur() {
    // free text that didn't select anything: back to the last valid choice
    if (open) close();
    else text = selected?.display ?? "";
    onblur?.();
  }
</script>

<div class="combo" class:open class:inline data-picker={picker || undefined}>
  <label class="combo-label" for={id}>{label}</label>
  <div class="combo-field">
    <input
      bind:this={input}
      {id}
      type="text"
      role="combobox"
      autocomplete="off"
      spellcheck="false"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={open && activeOption ? optionId(activeOption.id) : undefined}
      aria-invalid={error ? "true" : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {placeholder}
      value={text}
      oninput={onInput}
      onkeydown={onKeydown}
      onblur={onBlur}
      onclick={() => (open ? null : openList(true))}
    />
    <button
      type="button"
      class="combo-toggle"
      tabindex="-1"
      aria-label="Show options"
      onmousedown={(e) => {
        e.preventDefault();
        if (open) close();
        else {
          input?.focus();
          openList(true);
        }
      }}>▾</button
    >
    <ul bind:this={list} class="combo-list" class:above id={listId} role="listbox" aria-label={label} hidden={!open}>
      {#each groups as g, gi (g.group + gi)}
        {#if g.group}<li class="combo-group" role="presentation">{g.group}</li>{/if}
        {#each g.options as o (o.id)}
          {@const isActive = activeOption?.id === o.id}
          <li
            id={optionId(o.id)}
            role="option"
            aria-selected={o.id === value}
            class="combo-option"
            class:active={isActive}
            class:selected={o.id === value}
            onmousedown={(e) => {
              e.preventDefault();
              choose(o);
            }}
            onmousemove={() => (active = visible.indexOf(o))}
          >
            <span class="combo-option-label">{o.label}</span>
            {#if o.sub}<span class="combo-option-sub">{o.sub}{query && o.group ? ` · ${o.group}` : ""}</span>{/if}
          </li>
        {/each}
      {:else}
        <li class="combo-empty" role="presentation">No match for “{text}”</li>
      {/each}
    </ul>
  </div>
  {#if error}<p class="combo-error" id="{id}-error">{error}</p>{/if}
</div>

<style>
  .combo {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  /* inline: label left of the input (saves a row) */
  .combo.inline {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: var(--space-3);
  }

  .combo.inline .combo-error {
    grid-column: 2;
  }

  .combo-label {
    color: var(--color-muted);
    font-family: var(--font-heading);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .combo-field {
    position: relative;
  }

  input {
    width: 100%;
    min-height: var(--touch);
    padding: 0 40px 0 var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text);
    font: inherit;
    font-weight: 600;
  }

  input:hover {
    border-color: #4a5058;
  }

  input[aria-invalid="true"] {
    border-color: #e5484d;
  }

  .combo-toggle {
    position: absolute;
    top: 0;
    right: 0;
    width: 40px;
    height: 100%;
    border: 0;
    background: none;
    color: var(--color-muted);
    font-size: 16px;
    cursor: pointer;
  }

  .combo-list {
    position: absolute;
    z-index: 30;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 320px;
    margin: 0;
    padding: var(--space-1) 0;
    overflow-y: auto;
    list-style: none;
    background: var(--color-panel);
    border: 1px solid #4a5058;
    box-shadow: 0 12px 28px rgb(0 0 0 / 0.5);
  }

  .combo-list.above {
    top: auto;
    bottom: calc(100% + 4px);
  }

  .combo-list[hidden] {
    display: none;
  }

  .combo-group {
    padding: var(--space-2) var(--space-3) 2px;
    color: var(--color-muted);
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .combo-option {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 2px var(--space-2);
    min-height: 36px;
    padding: 7px var(--space-3);
    cursor: pointer;
  }

  .combo-option.active {
    background: #2b3038;
    box-shadow: inset 3px 0 0 var(--color-accent);
  }

  .combo-option.selected .combo-option-label {
    color: var(--color-accent);
  }

  .combo-option-label {
    font-weight: 700;
  }

  .combo-option-sub {
    color: var(--color-muted);
    font-size: 14px;
  }

  .combo-empty {
    padding: var(--space-2) var(--space-3);
    color: var(--color-muted);
  }

  .combo-error {
    margin: 0;
    color: #ff8b8e;
    font-size: 14px;
  }
</style>
