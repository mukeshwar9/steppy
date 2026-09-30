import { useRef } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { formatDayMonth, formatSteps, weekdayShort } from "../lib/format";
import { radius, useTheme } from "../theme";
import { AppText, Card } from "./ui";

export type DailyRow = {
  id: string;
  name: string;
  isMe: boolean;
  steps: Array<number | null>;
  /** Whether each day is final; unsettled days are shaded. Omit when unknown. */
  settled?: boolean[];
};

const NAME_W = 104;
const CELL_W = 72;
const ROW_H = 44;
const HEAD_H = 46;

/** Member rows x day columns. Names stay fixed on the left; day columns scroll horizontally. */
export function DailyGrid(props: { dates: string[]; rows: DailyRow[]; today?: string }) {
  const { colors } = useTheme();
  const scroller = useRef<ScrollView>(null);
  const anyUnsettled = props.rows.some((r) => r.settled?.some((s) => !s));
  return (
    <View>
      <Card padded={false} style={{ overflow: "hidden" }}>
        <View style={{ flexDirection: "row" }}>
          <View style={{ width: NAME_W, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border }}>
            <View style={{ height: HEAD_H }} />
            {props.rows.map((row) => (
              <View
                key={row.id}
                style={[styles.nameCell, { backgroundColor: row.isMe ? colors.highlight : "transparent", borderTopColor: colors.border }]}
              >
                <AppText variant="caption" numberOfLines={1} style={{ fontWeight: row.isMe ? "800" : "600" }}>
                  {row.name}
                </AppText>
              </View>
            ))}
          </View>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator
            onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
          >
            <View>
              <View style={{ flexDirection: "row", height: HEAD_H }}>
                {props.dates.map((date) => (
                  <View key={date} style={[styles.headCell, date === props.today && { backgroundColor: colors.primarySoft }]}>
                    <AppText variant="caption" muted style={{ fontWeight: "700" }}>
                      {weekdayShort(date)}
                    </AppText>
                    <AppText variant="caption" muted>
                      {formatDayMonth(date)}
                    </AppText>
                  </View>
                ))}
              </View>
              {props.rows.map((row) => (
                <View key={row.id} style={{ flexDirection: "row", backgroundColor: row.isMe ? colors.highlight : "transparent" }}>
                  {props.dates.map((date, i) => {
                    const value = row.steps[i] ?? null;
                    const unsettled = row.settled ? row.settled[i] === false : false;
                    return (
                      <View
                        key={date}
                        style={[
                          styles.cell,
                          { borderTopColor: colors.border },
                          unsettled && { backgroundColor: colors.cardAlt, opacity: 0.85 }
                        ]}
                        accessible
                        accessibilityLabel={`${row.name}, ${formatDayMonth(date)}, ${value === null ? "no data" : formatSteps(value) + " steps"}${unsettled ? ", not final yet" : ""}`}
                      >
                        <AppText variant="caption" muted={value === null || unsettled} style={unsettled ? { fontStyle: "italic" } : { fontWeight: "600" }}>
                          {value === null ? "–" : formatSteps(value)}
                        </AppText>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Card>
      {anyUnsettled ? (
        <AppText variant="caption" muted style={{ marginTop: 6 }}>
          Shaded italic days are not final yet; they settle at 10:00 the next day.
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nameCell: { height: ROW_H, justifyContent: "center", paddingHorizontal: 10, borderTopWidth: StyleSheet.hairlineWidth },
  headCell: { width: CELL_W, height: HEAD_H, alignItems: "center", justifyContent: "center", borderRadius: radius.sm },
  cell: { width: CELL_W, height: ROW_H, alignItems: "center", justifyContent: "center", borderTopWidth: StyleSheet.hairlineWidth }
});
