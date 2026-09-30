import { useColorScheme } from "react-native";

export type Palette = {
  background: string;
  card: string;
  cardAlt: string;
  text: string;
  textSecondary: string;
  border: string;
  primary: string;
  onPrimary: string;
  primarySoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  success: string;
  successSoft: string;
  info: string;
  infoSoft: string;
  highlight: string;
};

const light: Palette = {
  background: "#F4F6F5",
  card: "#FFFFFF",
  cardAlt: "#EEF2F0",
  text: "#14201B",
  textSecondary: "#5B6B64",
  border: "#DDE4E0",
  primary: "#0E9F6E",
  onPrimary: "#FFFFFF",
  primarySoft: "#D9F2E8",
  danger: "#D92D20",
  dangerSoft: "#FDE7E5",
  warning: "#B45309",
  warningSoft: "#FEF0D6",
  success: "#0B7A54",
  successSoft: "#D9F2E8",
  info: "#2563EB",
  infoSoft: "#E0EAFD",
  highlight: "#E6F6EF"
};

const dark: Palette = {
  background: "#0C1210",
  card: "#16201C",
  cardAlt: "#1D2A25",
  text: "#EAF2EE",
  textSecondary: "#9DB0A7",
  border: "#2A3832",
  primary: "#34D399",
  onPrimary: "#04261A",
  primarySoft: "#14372B",
  danger: "#F87171",
  dangerSoft: "#3A1B19",
  warning: "#FBBF24",
  warningSoft: "#3A2E12",
  success: "#34D399",
  successSoft: "#14372B",
  info: "#7AA7FF",
  infoSoft: "#1A2A4D",
  highlight: "#173329"
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, pill: 999 } as const;
/** Minimum accessible touch target. */
export const MIN_TOUCH = 44;

export type Theme = { dark: boolean; colors: Palette };

const themes: { light: Theme; dark: Theme } = {
  light: { dark: false, colors: light },
  dark: { dark: true, colors: dark }
};

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? themes.dark : themes.light;
}
