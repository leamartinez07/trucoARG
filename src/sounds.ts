const cardSamples = [1, 2, 3, 4].map((number) => `/audio/card-place-${number}.ogg`);
const callSample = '/audio/card-slide-2.ogg';
const samples = [...cardSamples, callSample];
let prepared = false;
let lastCard = -1;

// Load the small recordings only after the player interacts with the page.
export function unlockSounds() {
  if (prepared) return;
  prepared = true;
  for (const source of samples) {
    const audio = new Audio(source);
    audio.preload = 'auto';
    audio.load();
  }
}

function playSample(source: string, volume: number) {
  try {
    const audio = new Audio(source);
    audio.volume = volume;
    void audio.play().catch(() => {});
  } catch {
    // Sound is optional when the browser does not allow playback.
  }
}

export function playCardSound() {
  const offset = 1 + Math.floor(Math.random() * (cardSamples.length - 1));
  lastCard = (lastCard + offset) % cardSamples.length;
  playSample(cardSamples[lastCard], 0.3);
}

export function playCallSound() {
  playSample(callSample, 0.2);
}
