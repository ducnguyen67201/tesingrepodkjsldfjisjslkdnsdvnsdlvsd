"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseHsl, formatHsl, hslToHex, hexToHsl } from "./theme-wrapper";

// ============================================================================
// Types
// ============================================================================

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Color picker component with HSL sliders and hex input.
 * Designed for editing CSS color variables in HSL format.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  className,
}: ColorPickerProps) {
  // Parse initial HSL value
  const initialHsl = useMemo(() => parseHsl(value) ?? { h: 0, s: 0, l: 50 }, [value]);

  const [hue, setHue] = useState(initialHsl.h);
  const [saturation, setSaturation] = useState(initialHsl.s);
  const [lightness, setLightness] = useState(initialHsl.l);
  const [hexInput, setHexInput] = useState(hslToHex(initialHsl.h, initialHsl.s, initialHsl.l));
  const [isOpen, setIsOpen] = useState(false);

  // Sync state when value prop changes
  useEffect(() => {
    const parsed = parseHsl(value);
    if (parsed) {
      setHue(parsed.h);
      setSaturation(parsed.s);
      setLightness(parsed.l);
      setHexInput(hslToHex(parsed.h, parsed.s, parsed.l));
    }
  }, [value]);

  // Compute current hex color
  const currentHex = useMemo(
    () => hslToHex(hue, saturation, lightness),
    [hue, saturation, lightness]
  );

  // Update parent when HSL changes
  const updateColor = useCallback(
    (h: number, s: number, l: number) => {
      onChange(formatHsl(h, s, l));
      setHexInput(hslToHex(h, s, l));
    },
    [onChange]
  );

  // Handle hue change
  const handleHueChange = useCallback(
    (values: number[]) => {
      const newHue = values[0] ?? 0;
      setHue(newHue);
      updateColor(newHue, saturation, lightness);
    },
    [saturation, lightness, updateColor]
  );

  // Handle saturation change
  const handleSaturationChange = useCallback(
    (values: number[]) => {
      const newSat = values[0] ?? 0;
      setSaturation(newSat);
      updateColor(hue, newSat, lightness);
    },
    [hue, lightness, updateColor]
  );

  // Handle lightness change
  const handleLightnessChange = useCallback(
    (values: number[]) => {
      const newLight = values[0] ?? 0;
      setLightness(newLight);
      updateColor(hue, saturation, newLight);
    },
    [hue, saturation, updateColor]
  );

  // Handle hex input change
  const handleHexInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const hex = e.target.value;
      setHexInput(hex);

      // Only update if valid hex
      if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
        const parsed = hexToHsl(hex);
        if (parsed) {
          setHue(parsed.h);
          setSaturation(parsed.s);
          setLightness(parsed.l);
          onChange(formatHsl(parsed.h, parsed.s, parsed.l));
        }
      }
    },
    [onChange]
  );

  // Handle hex input blur - validate and fix
  const handleHexBlur = useCallback(() => {
    // If invalid, reset to current color
    if (!/^#[0-9A-Fa-f]{6}$/.test(hexInput)) {
      setHexInput(currentHex);
    }
  }, [hexInput, currentHex]);

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start gap-2 font-mono text-xs"
          >
            <div
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: currentHex }}
            />
            <span className="truncate">{value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-4">
            {/* Color preview */}
            <div
              className="h-20 w-full rounded-lg border"
              style={{ backgroundColor: currentHex }}
            />

            {/* Hex input */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground w-10">Hex</Label>
              <Input
                value={hexInput}
                onChange={handleHexInputChange}
                onBlur={handleHexBlur}
                className="font-mono text-sm"
                placeholder="#FFFFFF"
              />
            </div>

            {/* Hue slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Hue</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {Math.round(hue)}
                </span>
              </div>
              <Slider
                value={[hue]}
                onValueChange={handleHueChange}
                min={0}
                max={360}
                step={1}
                className="hue-slider"
              />
            </div>

            {/* Saturation slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Saturation</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {Math.round(saturation)}%
                </span>
              </div>
              <Slider
                value={[saturation]}
                onValueChange={handleSaturationChange}
                min={0}
                max={100}
                step={1}
              />
            </div>

            {/* Lightness slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-muted-foreground">Lightness</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {Math.round(lightness)}%
                </span>
              </div>
              <Slider
                value={[lightness]}
                onValueChange={handleLightnessChange}
                min={0}
                max={100}
                step={1}
              />
            </div>

            {/* HSL output */}
            <div className="text-xs text-muted-foreground font-mono text-center border-t pt-2">
              {formatHsl(hue, saturation, lightness)}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
