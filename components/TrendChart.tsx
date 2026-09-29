import React, { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

type Series = { name: string; values: number[] };

const PALETTE = ['#3B82F6', '#F97316', '#16A34A'];

/** Monthly quantity trend line chart (design screen 344), built on react-native-svg. */
export function TrendChart({
  months,
  series,
  height = 170,
}: {
  months: string[];
  series: Series[];
  height?: number;
}) {
  const [width, setWidth] = useState(0);
  const padding = { top: 12, right: 10, bottom: 22, left: 30 };

  if (!months.length || !series.length) {
    return (
      <View className="items-center py-8">
        <Text className="text-[13px] text-muted">Not enough purchase history yet</Text>
      </View>
    );
  }

  const maxValue = Math.max(...series.flatMap((s) => s.values), 1);
  const roundedMax = Math.ceil(maxValue / 20) * 20 || 20;
  const plotW = Math.max(width - padding.left - padding.right, 10);
  const plotH = height - padding.top - padding.bottom;

  const x = (i: number) =>
    padding.left + (months.length === 1 ? plotW / 2 : (plotW * i) / (months.length - 1));
  const y = (v: number) => padding.top + plotH - (v / roundedMax) * plotH;

  const gridValues = [0, roundedMax / 2, roundedMax];

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <>
          <Svg width={width} height={height}>
            {gridValues.map((g) => (
              <React.Fragment key={g}>
                <Line
                  x1={padding.left}
                  y1={y(g)}
                  x2={width - padding.right}
                  y2={y(g)}
                  stroke="#EDF1F6"
                  strokeWidth={1}
                />
                <SvgText
                  x={padding.left - 6}
                  y={y(g) + 3}
                  fontSize={9}
                  fill="#94A3B8"
                  textAnchor="end">
                  {g}
                </SvgText>
              </React.Fragment>
            ))}
            {months.map((m, i) => (
              <SvgText
                key={`${m}-${i}`}
                x={x(i)}
                y={height - 6}
                fontSize={9}
                fill="#94A3B8"
                textAnchor="middle">
                {m}
              </SvgText>
            ))}
            {series.map((s, si) => {
              const color = PALETTE[si % PALETTE.length];
              const path = s.values
                .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
                .join(' ');
              return (
                <React.Fragment key={s.name}>
                  <Path
                    d={path}
                    stroke={color}
                    strokeWidth={2}
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {s.values.map((v, i) => (
                    <Circle key={i} cx={x(i)} cy={y(v)} r={2.6} fill={color} />
                  ))}
                </React.Fragment>
              );
            })}
          </Svg>
          <View className="mt-1 flex-row flex-wrap items-center justify-center">
            {series.map((s, si) => (
              <View key={s.name} className="mr-4 flex-row items-center">
                <View
                  className="mr-1.5 h-2 w-2 rounded-full"
                  style={{ backgroundColor: PALETTE[si % PALETTE.length] }}
                />
                <Text className="text-[10px] text-sub">{s.name}</Text>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
