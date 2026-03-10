<script lang="ts">
  import { activeScreen } from "../stores/ui.js"
  import { theme, design, type Theme, type Design } from "../stores/settings.js"
</script>

<div class="screen settings">
  <header>
    <button class="back-btn" onclick={() => activeScreen.set("home")}>← Back</button>
    <h2>Settings</h2>
  </header>

  <div class="list" data-scroll-root="screen">
    <!-- Theme section -->
    <div class="section-label">Theme</div>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Default</span>
        <span class="row-sub">Dark gray background</span>
      </span>
      <input type="radio" name="theme" value="default" bind:group={$theme} />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">AMOLED</span>
        <span class="row-sub">Pure black — saves battery on OLED screens</span>
      </span>
      <input type="radio" name="theme" value="amoled" bind:group={$theme} />
    </label>

    <div class="divider"></div>

    <!-- Design section -->
    <div class="section-label">Typography</div>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Classic</span>
        <span class="row-sub">Spectral serif for story text, DM Sans for UI</span>
      </span>
      <input type="radio" name="design" value="classic" bind:group={$design} />
    </label>

    <label class="row">
      <span class="row-text">
        <span class="row-title">Roboto</span>
        <span class="row-sub">Clean sans-serif throughout — simpler and readable</span>
      </span>
      <input type="radio" name="design" value="roboto" bind:group={$design} />
    </label>
  </div>
</div>

<style>
  .settings {
    background: var(--bg);
  }

  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    min-height: 48px;
    flex-shrink: 0;
  }
  h2 {
    font-family: var(--font-ui);
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
    color: var(--text);
    letter-spacing: 0.01em;
  }
  .back-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    font-family: var(--font-ui);
    min-height: 44px;
    padding: 0 0.25rem;
  }
  .back-btn:hover {
    color: var(--text);
  }

  .list {
    flex: 1;
    overflow-y: auto;
  }

  .section-label {
    padding: 1.25rem 1rem 0.4rem;
    font-size: 0.7rem;
    font-family: var(--font-ui);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.12s;
    gap: 1rem;
  }
  .row:hover {
    background: var(--bg-action);
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
  }
  .row-title {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--text);
  }
  .row-sub {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.4;
  }

  input[type="radio"] {
    width: 18px;
    height: 18px;
    accent-color: var(--accent);
    flex-shrink: 0;
    cursor: pointer;
  }

  .divider {
    height: 1px;
    background: var(--border);
    margin: 0.5rem 0;
  }
</style>
