const flowers = [
  "Rose",
  "Lily",
  "Tulip",
  "Daisy",
  "Orchid",
  "Sunflower",
  "Iris",
  "Violet",
  "Peony",
  "Marigold",
  "Lavender",
  "Jasmine",
  "Camellia",
  "Magnolia",
  "Poppy",
];

const fruits = [
  "Apple",
  "Mango",
  "Peach",
  "Berry",
  "Lemon",
  "Cherry",
  "Grape",
  "Kiwi",
  "Plum",
  "Pear",
  "Melon",
  "Papaya",
  "Lychee",
  "Guava",
  "Fig",
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export function displayNameForDevice(deviceId?: string | null): string {
  if (!deviceId) return "Guest";
  const h = hashString(deviceId);
  const flower = flowers[h % flowers.length];
  const fruit = fruits[(Math.floor(h / 7) + h) % fruits.length];
  return `${flower} ${fruit}`;
}
