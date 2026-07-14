export type HoursSource = "manual" | "libcal" | "mock";

export type OperationalHoursInterval = {
  locationId: string;
  locationName: string;
  date: string;
  opensAt: string | null;
  closesAt: string | null;
  isClosed: boolean;
  note?: string;
  source: HoursSource;
  sourceId?: string;
  retrievedAt: string;
};

export type HoursProviderResult = {
  source: HoursSource;
  retrievedAt: string;
  intervals: OperationalHoursInterval[];
  raw?: unknown;
  warnings: string[];
};

export interface HoursProvider {
  readonly source: HoursSource;
  getHours(): Promise<HoursProviderResult>;
}

export const LIBCAL_HOURS_URL =
  process.env.LIBCAL_HOURS_JSON_URL ??
  "https://libcal.law.stanford.edu/widget/hours/grid?format=jsonld&lid=2457&org=2&callback=jsonldcb2457";
