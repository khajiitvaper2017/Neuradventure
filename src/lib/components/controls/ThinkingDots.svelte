<div class="thinking" aria-live="polite" aria-label="Generating">
  <span class="dot"></span><span class="dot"></span><span class="dot"></span>
</div>

<style>
  .thinking {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 0.75rem 0 0.5rem;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    border-radius: 50%;
    opacity: 0.5;
    animation: blink 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%,
    80%,
    100% {
      opacity: 0.2;
      transform: scale(0.75);
    }
    40% {
      opacity: 0.9;
      transform: scale(1);
    }
  }
</style>
