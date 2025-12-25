import { COLORS } from "@/lib/colors";

/**
 * Background ambience with noise texture, grid, and gradient orbs.
 * Renders as a fixed layer behind all content.
 */
export function BackgroundAmbience() {
  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {/* Noise Texture */}
      <div className="absolute inset-0 bg-noise z-10" />

      {/* Grid */}
      <div className="absolute inset-0 bg-grid opacity-30 z-0" />

      {/* Ice Orb - Top Left */}
      <div
        className="absolute top-[-10%] left-[20%] w-[800px] h-[800px] rounded-full blur-[100px] opacity-60 mix-blend-multiply"
        style={{ backgroundColor: COLORS.glow.ice }}
      />

      {/* Yellow Orb - Top Right */}
      <div
        className="absolute top-[10%] right-[-10%] w-[700px] h-[700px] rounded-full blur-[90px] opacity-50 mix-blend-multiply"
        style={{ backgroundColor: COLORS.glow.yellow }}
      />

      {/* Indigo Orb - Bottom Left */}
      <div
        className="absolute bottom-[-10%] left-[-5%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-60 mix-blend-multiply"
        style={{ backgroundColor: COLORS.glow.indigo }}
      />
    </div>
  );
}
