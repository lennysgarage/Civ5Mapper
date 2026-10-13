/** Presentation only: ownership and source colors remain unchanged. */
export const THEMES = {
  atlas: {
    text: "#fffdf6",
    halo: "#20313e",
    city: "#fffdf6",
    cityHalo: "#202c35",
    font: "Arial,sans-serif",
    grid: "#132d3c",
    tint: "#ffffff",
    mix: 0,
  },
  parchment: {
    text: "#493721",
    halo: "#f2e1bb",
    city: "#392b20",
    cityHalo: "#f5e6c8",
    font: "Georgia,serif",
    grid: "#705536",
    tint: "#ddc393",
    mix: 0.48,
  },
  minimalist: {
    text: "#243746",
    halo: "#ffffff",
    city: "#243746",
    cityHalo: "#ffffff",
    font: "Arial,sans-serif",
    grid: "#516570",
    tint: "#ffffff",
    mix: 0.3,
  },
};
export function presentationColor(color: string, theme: string): string {
  const { tint, mix } = THEMES[theme] ?? THEMES.atlas;
  if (!mix) return color;
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(color.slice(i, i + 2), 16) * (1 - mix) +
            parseInt(tint.slice(i, i + 2), 16) * mix,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
