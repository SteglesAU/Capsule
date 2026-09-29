import { useEffect, useRef, useCallback } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { useSettingsStore } from '../stores/settingsStore';
import { resolveClock24 } from '../lib/timeUtils';

/**
 * A "clock roller" (wheel) time picker. Renders 12-hour AM/PM or 24-hour depending
 * on the user's clock-format setting ('system' follows the device). Works on
 * iOS/Android and the web demo (selection detected via a debounced scroll-stop that
 * fires everywhere, plus native momentum-end). Keeps midday/midnight unambiguous:
 * 12:00 PM → "Midday", 12:00 AM → "Midnight". Local time; onChange returns 24h + minute.
 */
const ITEM_H = 42;
const VISIBLE = 5; // odd → a clear centre row

interface Props {
  hour24: number;
  minute: number;
  onChange: (hour24: number, minute: number) => void;
}

function to12(hour24: number): { h12: number; pm: boolean } {
  return { h12: hour24 % 12 || 12, pm: hour24 >= 12 };
}
function to24(h12: number, pm: boolean): number {
  const base = h12 % 12; // 12 -> 0
  return pm ? base + 12 : base;
}

function Wheel({ data, index, format, onSelect, width }: {
  data: number[]; index: number; format: (n: number) => string; onSelect: (i: number) => void; width: number;
}) {
  const ref = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false }), 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = useCallback((y: number) => {
    const i = Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_H)));
    ref.current?.scrollTo({ y: i * ITEM_H, animated: true });
    onSelect(i);
  }, [data.length, onSelect]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => settle(y), 120); // debounced stop — fires on web too
  };
  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => settle(e.nativeEvent.contentOffset.y);

  return (
    <ScrollView
      ref={ref}
      style={{ width, height: ITEM_H * VISIBLE }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_H}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onScroll={onScroll}
      onMomentumScrollEnd={onMomentumEnd}
      contentContainerStyle={{ paddingVertical: ITEM_H * Math.floor(VISIBLE / 2) }}
    >
      {data.map((n, i) => (
        <View key={n} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{
            fontSize: i === index ? 24 : 19,
            fontWeight: i === index ? '700' : '400',
            color: i === index ? '#60A5FA' : '#6B7280',
            fontVariant: ['tabular-nums'],
          }}>{format(n)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function TimeRoller({ hour24, minute, onChange }: Props) {
  const clockFormat = useSettingsStore(s => s.clockFormat);
  const use24 = resolveClock24(clockFormat);

  const minutes = Array.from({ length: 60 }, (_, i) => i);
  const { h12, pm } = to12(hour24);

  const timeStr = use24
    ? `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    : `${h12}:${String(minute).padStart(2, '0')} ${pm ? 'PM' : 'AM'}`;
  const caption = hour24 === 12 && minute === 0 ? 'Midday' : hour24 === 0 && minute === 0 ? 'Midnight' : timeStr;

  const minuteWheel = (
    <Wheel data={minutes} index={minute} format={n => String(n).padStart(2, '0')} onSelect={i => onChange(hour24, minutes[i])} width={use24 ? 74 : 64} />
  );

  return (
    <View style={{ position: 'relative', paddingVertical: 4 }}>
      {/* centre selection band */}
      <View pointerEvents="none" style={{
        position: 'absolute', left: 24, right: 24, top: ITEM_H * Math.floor(VISIBLE / 2), height: ITEM_H,
        borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(96,165,250,0.35)',
        backgroundColor: 'rgba(96,165,250,0.06)', borderRadius: 8,
      }} />
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 }}>
        {use24 ? (
          <>
            <Wheel data={Array.from({ length: 24 }, (_, i) => i)} index={hour24} format={n => String(n).padStart(2, '0')} onSelect={i => onChange(i, minute)} width={74} />
            <Text style={{ color: '#60A5FA', fontSize: 24, fontWeight: '700' }}>:</Text>
            {minuteWheel}
          </>
        ) : (
          <>
            <Wheel data={Array.from({ length: 12 }, (_, i) => i + 1)} index={h12 - 1} format={n => String(n)} onSelect={i => onChange(to24(i + 1, pm), minute)} width={64} />
            <Text style={{ color: '#60A5FA', fontSize: 24, fontWeight: '700' }}>:</Text>
            {minuteWheel}
            <Wheel data={[0, 1]} index={pm ? 1 : 0} format={n => (n === 1 ? 'PM' : 'AM')} onSelect={i => onChange(to24(h12, i === 1), minute)} width={64} />
          </>
        )}
      </View>
      <Text style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 15, marginTop: 8, fontWeight: '600' }}>{caption}</Text>
    </View>
  );
}
