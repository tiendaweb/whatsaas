'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Granularity } from '@/lib/ads/types';
import { GRANULARITY_OPTIONS, QUICK_RANGES, RANGE_OPTIONS, resolveRange, type Range, type RangeId } from './ranges';

type Props = {
  range: Range;
  rangeId: RangeId;
  granularity: Granularity;
  onRangeChange: (range: Range, id: RangeId) => void;
  onGranularityChange: (granularity: Granularity) => void;
};

export function RangeToolbar({ range, rangeId, granularity, onRangeChange, onGranularityChange }: Props) {
  const applyPreset = (id: RangeId) => onRangeChange(resolveRange(id, range), id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* En móvil los atajos se apilan; el resto de los rangos vive en el desplegable. */}
      {QUICK_RANGES.map((id) => {
        const option = RANGE_OPTIONS.find((item) => item.id === id)!;
        return (
          <Button
            key={id}
            size="sm"
            variant={rangeId === id ? 'default' : 'outline'}
            onClick={() => applyPreset(id)}
            className="shrink-0"
          >
            {option.label.replace('Últimos ', '')}
          </Button>
        );
      })}

      <Select value={rangeId} onValueChange={(value) => applyPreset(value as RangeId)}>
        <SelectTrigger className="w-[170px] shrink-0">
          <SelectValue placeholder="Período" />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
          {rangeId === 'custom' && <SelectItem value="custom">Personalizado</SelectItem>}
        </SelectContent>
      </Select>

      <Select value={granularity} onValueChange={(value) => onGranularityChange(value as Granularity)}>
        <SelectTrigger className="w-[130px] shrink-0">
          <SelectValue placeholder="Detalle" />
        </SelectTrigger>
        <SelectContent>
          {GRANULARITY_OPTIONS.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={range.since}
          max={range.until}
          onChange={(event) => onRangeChange({ ...range, since: event.target.value }, 'custom')}
          className="w-[145px] shrink-0"
        />
        <span className="text-sm text-muted-foreground">a</span>
        <Input
          type="date"
          value={range.until}
          min={range.since}
          onChange={(event) => onRangeChange({ ...range, until: event.target.value }, 'custom')}
          className="w-[145px] shrink-0"
        />
      </div>
    </div>
  );
}
