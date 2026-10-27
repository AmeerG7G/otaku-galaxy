'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { ProductVariant } from '@/lib/types';
import { initialVariantId, safeHex, variantAvailable } from '@/lib/variants';

/**
 * The colour chosen on a product page (STEP 74), shared by the gallery (the
 * colour's image) and the add-to-cart box (the colour's stock, the `variantId`
 * sent). A product without colours renders no provider and behaves as before.
 */
interface VariantSelectionValue {
  variants: ProductVariant[];
  selected: ProductVariant | null;
  select: (id: string) => void;
}

const VariantSelectionContext = createContext<VariantSelectionValue | null>(null);

export function VariantSelectionProvider({ variants, children }: { variants: ProductVariant[]; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(() => initialVariantId(variants));
  const selected = variants.find((variant) => variant.id === selectedId) ?? null;
  const select = (id: string) => {
    const variant = variants.find((candidate) => candidate.id === id);
    if (variant && variantAvailable(variant)) setSelectedId(id);
  };
  return <VariantSelectionContext.Provider value={{ variants, selected, select }}>{children}</VariantSelectionContext.Provider>;
}

export function useVariantSelection(): VariantSelectionValue | null {
  return useContext(VariantSelectionContext);
}

export function Swatch({ hex }: { hex: string | null | undefined }) {
  const color = safeHex(hex);
  if (!color) return null;
  return <span className="swatch" aria-hidden="true" style={{ background: color }} />;
}

/** Colour choices: unavailable colours (stock 0) are shown but disabled. */
export function ColorChoices() {
  const selection = useVariantSelection();
  if (!selection || selection.variants.length === 0) return null;
  return (
    <fieldset className="field color-choices">
      <legend className="label">اللون{selection.selected ? `: ${selection.selected.colorName}` : ''}</legend>
      <div className="color-choices__list">
        {selection.variants.map((variant) => {
          const available = variantAvailable(variant);
          return (
            <label key={variant.id} className={`color-choice${available ? '' : ' color-choice--out'}`}>
              <input
                type="radio"
                name="variant"
                value={variant.id}
                checked={selection.selected?.id === variant.id}
                disabled={!available}
                onChange={() => selection.select(variant.id)}
              />
              <Swatch hex={variant.colorHex} />
              <span>{variant.colorName}</span>
              {available ? null : <span className="hint">(نفد)</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
